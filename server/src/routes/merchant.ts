import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

/**
 * @openapi
 * /merchant/orders:
 *   get:
 *     summary: List all orders with payment status (merchant view)
 *     responses:
 *       200:
 *         description: Array of orders with items and withdrawal status
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   customerName:
 *                     type: string
 *                   customerEmail:
 *                     type: string
 *                   status:
 *                     type: string
 *                     enum: [PENDING_PAYMENT, PAID]
 *                   totalUsdc:
 *                     type: number
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 */
router.get('/orders', async (_req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        items: { include: { product: true } },
        withdrawal: true,
      },
    });
    res.json(orders);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /merchant/withdrawals:
 *   get:
 *     summary: List all COP withdrawals (merchant view)
 *     responses:
 *       200:
 *         description: Array of COP withdrawal records with payout status
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   orderId:
 *                     type: string
 *                   muralPayoutRequestId:
 *                     type: string
 *                   status:
 *                     type: string
 *                     enum: [PENDING, PROCESSING, COMPLETED, FAILED]
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 */
router.get('/withdrawals', async (_req, res, next) => {
  try {
    const withdrawals = await prisma.withdrawal.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            customerName: true,
            customerEmail: true,
            totalUsdc: true,
            createdAt: true,
          },
        },
      },
    });
    res.json(withdrawals);
  } catch (err) {
    next(err);
  }
});

export default router;
