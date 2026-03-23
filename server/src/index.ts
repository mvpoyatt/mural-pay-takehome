import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { initialize } from './lib/startup';
import { swaggerSpec } from './lib/openapi';
import { errorHandler } from './middleware/errors';

import healthRouter from './routes/health';
import productsRouter from './routes/products';
import ordersRouter from './routes/orders';
import merchantRouter from './routes/merchant';
import webhooksRouter from './routes/webhooks';
import devRouter from './routes/dev';

const app = express();

app.use(cors());

// Raw body needed for webhook signature verification — preserve before parsing
app.use('/api/webhooks', express.raw({ type: 'application/json' }), (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    (req as express.Request & { rawBody: string }).rawBody = req.body.toString();
    req.body = JSON.parse((req as express.Request & { rawBody: string }).rawBody);
  }
  next();
});

app.use(express.json());

// Routes
app.use('/health', healthRouter);
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/merchant', merchantRouter);
app.use('/api/webhooks', webhooksRouter);

// Dev helpers — local only
if (!process.env.RAILWAY_PUBLIC_DOMAIN) {
  app.use('/dev', devRouter);
}

// OpenAPI docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/openapi.json', (_req, res) => res.json(swaggerSpec));

app.use(errorHandler);

const PORT = config.port;

// Determine public webhook URL (Railway injects RAILWAY_PUBLIC_DOMAIN)
const publicDomain =
  process.env.RAILWAY_PUBLIC_DOMAIN ??
  process.env.PUBLIC_URL ??
  `http://localhost:${PORT}`;

const webhookUrl = `${publicDomain}/api/webhooks/mural`;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await initialize(webhookUrl);
  } catch (err) {
    console.error('Startup initialization failed:', err);
    // Don't crash — server still useful for non-Mural endpoints
  }
});

export default app;
