import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { state } from '../lib/startup';
import { config } from '../config';

const router = Router();

/**
 * @openapi
 * /orders:
 *   post:
 *     summary: Create a new order
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerName, customerEmail, items]
 *             properties:
 *               customerName:
 *                 type: string
 *               customerEmail:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [productId, quantity]
 *                   properties:
 *                     productId:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Order created — use walletAddress, chainId, and tokenAddress to construct the USDC payment
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orderId:
 *                   type: string
 *                   description: Use this to poll GET /orders/{id} for payment status
 *                 totalUsdc:
 *                   type: number
 *                   description: Exact USDC amount the customer must send
 *                 walletAddress:
 *                   type: string
 *                   description: Merchant Polygon wallet address (payment destination)
 *                 chainId:
 *                   type: integer
 *                   description: Polygon Amoy chain ID (80002)
 *                 tokenAddress:
 *                   type: string
 *                   description: USDC contract address on Polygon Amoy
 *       400:
 *         description: Invalid request
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerName, customerEmail, items } = req.body as {
      customerName: string;
      customerEmail: string;
      items: Array<{ productId: string; quantity: number }>;
    };

    if (!customerName || !customerEmail || !items?.length) {
      res.status(400).json({ error: 'customerName, customerEmail, and items are required' });
      return;
    }

    // Fetch products server-side — never trust client prices
    const productIds = items.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    if (products.length !== productIds.length) {
      res.status(400).json({ error: 'One or more products not found' });
      return;
    }

    // Calculate total
    let totalUsd = 0;
    const orderItems = items.map((item) => {
      const product = products.find((p) => p.id === item.productId)!;
      const lineTotal = product.priceUsd * item.quantity;
      totalUsd += lineTotal;
      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPriceUsd: product.priceUsd,
      };
    });

    const totalUsdc = parseFloat(totalUsd.toFixed(2));

    const order = await prisma.order.create({
      data: {
        customerName,
        customerEmail,
        totalUsdc,
        walletAddress: state.walletAddress,
        items: {
          create: orderItems,
        },
      },
      include: { items: true },
    });

    res.status(201).json({
      orderId: order.id,
      totalUsdc: order.totalUsdc,
      walletAddress: order.walletAddress,
      chainId: config.polygon.chainId,
      tokenAddress: config.polygon.usdcAddress,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /orders/{id}/confirm:
 *   patch:
 *     summary: Store the blockchain tx hash after wallet submission
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [txHash]
 *             properties:
 *               txHash:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tx hash stored
 *       404:
 *         description: Order not found
 */
router.patch('/:id/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { txHash } = req.body as { txHash: string };
    if (!txHash) {
      res.status(400).json({ error: 'txHash is required' });
      return;
    }

    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    await prisma.order.update({
      where: { id: req.params.id },
      data: { txHash },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /orders/{id}:
 *   get:
 *     summary: Get order status
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order details and current payment status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 customerName:
 *                   type: string
 *                 customerEmail:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [PENDING_PAYMENT, PAID, COMPLETED, FAILED]
 *                 totalUsdc:
 *                   type: number
 *                 walletAddress:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Order not found
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: true } }, withdrawal: true },
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.json(order);
  } catch (err) {
    next(err);
  }
});

export default router;
