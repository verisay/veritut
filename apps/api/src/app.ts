import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { apiRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1); // Traefik/nginx arkasında gerçek IP (audit + rate limit)
  app.use(helmet());
  app.use(compression());

  const allowList = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
  app.use(cors({ origin: allowList.length > 0 ? allowList : false, credentials: true }));

  // K3: webhook router'ları (alertmanager/billing/zammad) HMAC raw body için BURAYA, express.json'dan ÖNCE.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/v1/health' } }));

  app.use('/api/v1', apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
