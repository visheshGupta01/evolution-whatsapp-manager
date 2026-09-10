import 'dotenv/config';

const env = (name, fallback = '') => String(process.env[name] ?? fallback).trim();

export const config = Object.freeze({
  nodeEnv: env('NODE_ENV', 'development'),
  port: Number(process.env.PORT || 3000),
  clientOrigin: env('CLIENT_ORIGIN', 'http://localhost:5173'),
  evolutionUrl: env('EVOLUTION_API_URL').replace(/\/+$/, ''),
  evolutionKey: env('EVOLUTION_API_KEY'),
  evolutionTimeoutMs: Number(process.env.EVOLUTION_TIMEOUT_MS || 15000),
  webhookUrl: env('EVOLUTION_WEBHOOK_URL', 'http://localhost:3000/api/webhooks/evolution'),
  webhookSecret: env('EVOLUTION_WEBHOOK_SECRET'),
  bodyLimit: env('BODY_LIMIT', '1mb'),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120),
  instanceNamePattern: /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/,
});

export function assertConfiguration() {
  if (!config.evolutionUrl || !config.evolutionKey) {
    console.warn('[config] EVOLUTION_API_URL or EVOLUTION_API_KEY is missing.');
  }
}
