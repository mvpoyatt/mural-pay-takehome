import express, { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { state } from '../lib/startup';
import * as mural from '../mural/client';
import { WebhookEvent, AccountCreditedPayload, PayoutStatusPayload } from '../mural/types';

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
        await handlePayoutStatusChanged(event.payload as PayoutStatusPayload);
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

async function handlePayoutStatusChanged(payload: PayoutStatusPayload): Promise<void> {
  console.log('PAYOUT_REQUEST payload:', JSON.stringify(payload));
  const payoutRequestId = payload.payoutRequestId ?? payload.payoutId;
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

  const status = mapPayoutStatus(payload.status);
  await prisma.withdrawal.update({
    where: { id: withdrawal.id },
    data: { status },
  });

  // If payout completed, mark the order as completed too
  if (status === 'COMPLETED') {
    await prisma.order.update({
      where: { id: withdrawal.orderId },
      data: { status: 'COMPLETED' },
    });
  }

  console.log(`Withdrawal ${withdrawal.id} status -> ${status}`);
}

function mapPayoutStatus(muralStatus: string): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' {
  const s = muralStatus?.toLowerCase();
  if (s === 'executed' || s === 'completed') return 'COMPLETED';
  if (s === 'failed' || s === 'canceled' || s === 'refunded' || s === 'refinprogress') return 'FAILED';
  if (s === 'pending' || s === 'on_hold' || s === 'onhold' || s === 'on-hold') return 'PROCESSING';
  if (s === 'awaiting_execution') return 'PENDING';
  console.warn(`Unmapped Mural payout status: "${muralStatus}"`);
  return 'PENDING';
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
