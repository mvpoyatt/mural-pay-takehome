// Dev-only endpoints for local testing. NOT mounted in production.
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { state } from '../lib/startup';
import * as mural from '../mural/client';

const router = Router();

// Manually mark an order PAID and trigger COP payout.
// Usage: POST /dev/pay/:orderId
router.post('/pay/:orderId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (order.status !== 'PENDING_PAYMENT') {
      res.json({ skipped: true, reason: `Order status is already ${order.status}` });
      return;
    }

    await prisma.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
    console.log(`[dev] Marked order ${order.id} as PAID`);

    const payoutRequest = await mural.createPayout({
      accountId: state.accountId,
      counterpartyId: state.counterpartyId,
      payoutMethodId: state.payoutMethodId,
      tokenAmount: parseFloat(order.totalUsdc.toFixed(2)),
    });

    await mural.executePayout(payoutRequest.id);

    await prisma.withdrawal.create({
      data: {
        orderId: order.id,
        muralPayoutRequestId: payoutRequest.id,
        amountCop: payoutRequest.payouts?.[0]?.fiatAmount ?? null,
        status: 'PENDING',
      },
    });

    console.log(`[dev] COP payout initiated: payoutRequestId=${payoutRequest.id}`);
    res.json({ ok: true, payoutRequestId: payoutRequest.id });
  } catch (err) {
    next(err);
  }
});

// List pending orders (to find orderId for the above)
router.get('/orders', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const orders = await prisma.order.findMany({
      where: { status: 'PENDING_PAYMENT' },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

export default router;
