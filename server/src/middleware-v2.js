import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';

export function registerMiddleware(app) {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.clientOrigin === '*' ? true : config.clientOrigin, credentials: true }));
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));

  const buckets = new Map();
  app.use((req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const current = buckets.get(key);
    if (!current || now - current.startedAt >= config.rateLimitWindowMs) buckets.set(key, { startedAt: now, count: 1 });
    else current.count += 1;
    const entry = buckets.get(key);
    res.setHeader('X-RateLimit-Limit', config.rateLimitMax);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, config.rateLimitMax - entry.count));
    if (entry.count > config.rateLimitMax) return res.status(429).json({ ok: false, message: 'Too many requests. Try again later.' });
    next();
  });
}

export function errorHandler(err, _req, res, _next) {
  const status = Number(err?.status || err?.statusCode || 500);
  if (status >= 500) console.error('[server:error]', err);
  res.status(status).json({ ok: false, message: err?.message || 'Internal server error' });
}
