import express, { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { state } from '../lib/startup';
import * as mural from '../mural/client';
import { WebhookEvent, AccountCreditedPayload } from '../mural/types';

const router = Router();

/**
 * @openapi
 * /webhooks/mural:
 *   post:
 *     summary: Receive Mural Pay webhook events
 *     responses:
 *       200:
 *         description: Event received
 *       401:
 *         description: Invalid signature
 */
router.post('/mural', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify ECDSA signature
    if (!verifySignature(req)) {
      console.warn('Webhook signature verification failed');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const event = req.body as WebhookEvent;
    console.log(`Webhook received: ${event.eventCategory} (${event.eventId})`);

    // Route by event category
    switch (event.eventCategory) {
      case 'MURAL_ACCOUNT_BALANCE_ACTIVITY':
        if ((event.payload as AccountCreditedPayload).type === 'account_credited') {
          await handleAccountCredited(event.payload as AccountCreditedPayload);
        }
        break;
      case 'PAYOUT_REQUEST':
        await handlePayoutStatusChanged(event.payload as any);
        break;
      default:
        console.log(`Unhandled event category: ${event.eventCategory}`);
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

function verifySignature(req: Request): boolean {
  const publicKey = state.webhookPublicKey;
  if (!publicKey) {
    // No public key yet (e.g. startup not complete) — skip verification in dev
    console.warn('No webhook public key available, skipping signature verification');
    return true;
  }

  const signature = req.headers['x-mural-webhook-signature'] as string;
  const timestamp = req.headers['x-mural-webhook-timestamp'] as string;

  if (!signature || !timestamp) return false;

  // Check timestamp freshness (5 minute window)
  const eventTime = new Date(timestamp).getTime();
  if (Math.abs(Date.now() - eventTime) > 5 * 60 * 1000) {
    console.warn('Webhook timestamp outside 5-minute window');
    return false;
  }

  // Verify ECDSA signature: message = "{timestamp}.{rawBody}"
  const rawBody = (req as express.Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);
  const message = `${timestamp}.${rawBody}`;

  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(message);
    const signatureBytes = Buffer.from(signature, 'base64');
    return verify.verify(publicKey, signatureBytes);
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

async function handleAccountCredited(payload: AccountCreditedPayload): Promise<void> {
  console.log('Processing account_credited:', JSON.stringify(payload));

  const blockchainTxHash = payload.transactionDetails?.transactionHash ?? null;
  const tokenAmount = payload.tokenAmount?.tokenAmount ?? null;

  let order = null;

  // Primary: match by tx hash
  if (blockchainTxHash) {
    order = await prisma.order.findFirst({
      where: { txHash: blockchainTxHash, status: 'PENDING_PAYMENT' },
    });
    if (order) console.log(`Matched order ${order.id} by tx hash`);
  }

  // Fallback: most recent PENDING_PAYMENT order with matching amount and no txHash stored
  // Handles the case where the customer sent USDC manually (no UI / PATCH /confirm call)
  if (!order && tokenAmount) {
    order = await prisma.order.findFirst({
      where: { status: 'PENDING_PAYMENT', txHash: null, totalUsdc: tokenAmount },
      orderBy: { createdAt: 'desc' },
    });
    if (order) console.log(`Matched order ${order.id} by fallback (amount=${tokenAmount} USDC, no txHash)`);
  }

  if (!order) {
    console.warn(
      `No matching order found for account_credited event. ` +
      `txHash=${blockchainTxHash}, amount=${tokenAmount}. Logging as unmatched.`
    );
    // Log unmatched payment for manual review
    await logUnmatchedPayment(payload);
    return;
  }

  // Mark order as paid
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'PAID' },
  });

  // Trigger COP payout immediately
  await initiateCopPayout(order.id, order.totalUsdc);
}

async function initiateCopPayout(orderId: string, usdcAmount: number): Promise<void> {
  try {
    const payoutRequest = await mural.createPayout({
      accountId: state.accountId,
      counterpartyId: state.counterpartyId,
      payoutMethodId: state.payoutMethodId,
      tokenAmount: parseFloat(usdcAmount.toFixed(2)),
    });

    await mural.executePayout(payoutRequest.id);

    await prisma.withdrawal.create({
      data: {
        orderId,
        muralPayoutRequestId: payoutRequest.id,
        amountCop: payoutRequest.payouts?.[0]?.fiatAmount ?? null,
        status: 'PENDING',
      },
    });

    console.log(`COP payout initiated for order ${orderId}, payoutRequestId=${payoutRequest.id}`);
  } catch (err) {
    // Payment was received — keep order as PAID even if payout fails
    console.error(`Failed to initiate COP payout for order ${orderId}:`, err);
  }
}

async function handlePayoutStatusChanged(payload: any): Promise<void> {
  const p = payload as any;
  const payoutRequestId = p.payoutRequestId;
  if (!payoutRequestId) {
    console.warn('payout status event missing payoutRequestId', payload);
    return;
  }

  const withdrawal = await prisma.withdrawal.findFirst({
    where: { muralPayoutRequestId: payoutRequestId },
  });

  if (!withdrawal) {
    console.warn(`No withdrawal found for payoutRequestId=${payoutRequestId}`);
    return;
  }

  const eventType = p.type;
  const statusChangeDetails = p.statusChangeDetails;
  const currentStatusType = statusChangeDetails?.currentStatus?.type ?? '';

  let status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

  if (eventType === 'payout_status_changed' && statusChangeDetails?.type === 'fiat') {
    // Fiat (COP bank transfer) — the event we care about for completion
    status = mapFiatPayoutStatus(currentStatusType);
  } else if (eventType === 'payout_request_status_changed') {
    // Only surface failures from the request level — request 'executed' does not
    // mean COP arrived, that comes from the fiat payout_status_changed event
    if (currentStatusType === 'failed' || currentStatusType === 'canceled') {
      status = 'FAILED';
    } else {
      console.log(`Ignoring payout_request_status_changed: ${currentStatusType}`);
      return;
    }
  } else {
    // Blockchain payout or unknown type — ignore
    console.log(`Ignoring ${eventType} (${statusChangeDetails?.type ?? 'unknown'}): ${currentStatusType}`);
    return;
  }

  // Don't move backwards — COMPLETED and FAILED are terminal
  if (withdrawal.status === 'COMPLETED' || withdrawal.status === 'FAILED') {
    console.log(`Withdrawal ${withdrawal.id} already ${withdrawal.status}, ignoring`);
    return;
  }

  await prisma.withdrawal.update({
    where: { id: withdrawal.id },
    data: { status },
  });

  console.log(`Withdrawal ${withdrawal.id} status -> ${status}`);
}

function mapFiatPayoutStatus(s: string): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' {
  switch (s) {
    case 'created': return 'PENDING';
    case 'pending': return 'PROCESSING';
    case 'onHold': return 'PROCESSING';
    case 'completed': return 'COMPLETED';
    case 'failed': return 'FAILED';
    case 'canceled': return 'FAILED';
    case 'refundInProgress': return 'FAILED';
    case 'refunded': return 'FAILED';
    default:
      console.warn(`Unmapped fiat payout status: "${s}"`);
      return 'PROCESSING';
  }
}

async function logUnmatchedPayment(payload: AccountCreditedPayload): Promise<void> {
  // Simple console log — production would persist this to an unmatched_payments table
  console.error('[UNMATCHED PAYMENT]', JSON.stringify({
    transactionId: payload.transactionId,
    amount: payload.tokenAmount?.tokenAmount,
    txHash: payload.transactionDetails?.transactionHash,
    fromAddress: payload.transactionDetails?.sourceWalletAddress,
    occurredAt: new Date().toISOString(),
  }));
}

export default router;
