import { Router } from 'express';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Service is running
 */
router.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

export default router;
