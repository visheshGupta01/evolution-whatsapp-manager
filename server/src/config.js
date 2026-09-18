import 'dotenv/config';

const env = (name, fallback = '') => String(process.env[name] ?? fallback).trim();

export const config = Object.freeze({
  nodeEnv: env('NODE_ENV', 'development'),
  port: Number(process.env.PORT || 3000),
  clientOrigin: env('CLIENT_ORIGIN', 'http://localhost:5173'),
  evolutionUrl: env('EVOLUTION_API_URL').replace(/\/+$/, ''),
  evolutionKey: env('EVOLUTION_API_KEY'),
  databaseUrl: env('DATABASE_URL'),
  evolutionWebhookUrl: env('EVOLUTION_WEBHOOK_URL'),
  evolutionTimeoutMs: Number(process.env.EVOLUTION_TIMEOUT_MS || 60000),
  bodyLimit: env('BODY_LIMIT', '12mb'),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120),
  campaignMinDelayMs: Number(process.env.CAMPAIGN_MIN_DELAY_MS || 1500),
  campaignMaxActive: Number(process.env.CAMPAIGN_MAX_ACTIVE || 1),
  campaignDailyRecipientLimit: Number(process.env.CAMPAIGN_DAILY_RECIPIENT_LIMIT || 1000),
  campaignCreateWindowMinutes: Number(process.env.CAMPAIGN_CREATE_WINDOW_MINUTES || 10),
  campaignCreateLimit: Number(process.env.CAMPAIGN_CREATE_LIMIT || 10),
  campaignAutoPauseMinResults: Number(process.env.CAMPAIGN_AUTO_PAUSE_MIN_RESULTS || 20),
  campaignAutoPauseFailureRate: Number(process.env.CAMPAIGN_AUTO_PAUSE_FAILURE_RATE || 0.35),
  instanceNamePattern: /^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$/,
});

export function assertConfiguration() {
  if (!config.evolutionUrl || !config.evolutionKey) {
    console.warn('[config] EVOLUTION_API_URL or EVOLUTION_API_KEY is missing.');
  }
}
