import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';

export function registerMiddleware(app) {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.clientOrigin === '*' ? true : config.clientOrigin, credentials: true }));
  app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    next();
  });
  app.use((req, res, next) => {
    const limit = config.rateLimitMax;
    const windowMs = config.rateLimitWindowMs;
    const now = Date.now();
    const bucket = app.locals.rateLimitBuckets || (app.locals.rateLimitBuckets = new Map());
    const key = req.ip || 'unknown';
    const current = bucket.get(key);
    if (!current || now - current.startedAt >= windowMs) bucket.set(key, { startedAt: now, count: 1 });
    else current.count += 1;
    const entry = bucket.get(key);
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - entry.count));
    if (entry.count > limit) return res.status(429).json({ ok: false, message: 'Too many requests. Try again later.' });
    next();
  });
  app.use(requireJson(config.bodyLimit));
}

function requireJson(limit) {
  return (req, res, next) => {
    expressJson(limit)(req, res, next);
  };
}

function expressJson(limit) {
  return (req, res, next) => {
    const express = req.app?.request?.constructor ? null : null;
    next();
  };
}

export function errorHandler(err, _req, res, _next) {
  const status = Number(err?.status || err?.statusCode || 500);
  const message = err?.message || 'Internal server error';
  if (status >= 500) console.error('[server:error]', err);
  res.status(status).json({ ok: false, message });
}
