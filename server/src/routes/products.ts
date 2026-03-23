import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

/**
 * @openapi
 * /products:
 *   get:
 *     summary: List all products
 *     responses:
 *       200:
 *         description: Array of products
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *                   priceUsd:
 *                     type: number
 *                   imageUrl:
 *                     type: string
 *                   stock:
 *                     type: integer
 */
router.get('/', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(products);
  } catch (err) {
    next(err);
  }
});

export default router;
