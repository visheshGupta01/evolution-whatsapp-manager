import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.DATABASE_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

export async function initDatabase() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required.');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, instance TEXT NOT NULL,
      status TEXT NOT NULL, delay_ms INTEGER NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      total INTEGER NOT NULL DEFAULT 0, sent INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, error TEXT
    );
    CREATE TABLE IF NOT EXISTS campaign_recipients (
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      recipient_index INTEGER NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      recipient JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (campaign_id, recipient_index)
    );
    CREATE INDEX IF NOT EXISTS campaign_recipients_phone_idx ON campaign_recipients(phone);
    CREATE TABLE IF NOT EXISTS campaign_results (
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      recipient_index INTEGER NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      ok BOOLEAN NOT NULL,
      message TEXT,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (campaign_id, recipient_index)
    );
    CREATE INDEX IF NOT EXISTS campaign_results_status_idx ON campaign_results(campaign_id, ok);
    CREATE TABLE IF NOT EXISTS campaign_messages (
      campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      recipient_index INTEGER NOT NULL,
      message_id TEXT NOT NULL,
      message_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (campaign_id, message_id)
    );
    CREATE INDEX IF NOT EXISTS campaign_messages_lookup_idx ON campaign_messages(message_id);
    CREATE INDEX IF NOT EXISTS campaign_messages_recipient_idx ON campaign_messages(campaign_id, recipient_index);
    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS templates_updated_at_idx ON templates(updated_at DESC);
  `);
  await migrateLegacyCampaigns();
}

async function migrateLegacyCampaigns() {
  const legacy = await pool.query(`SELECT id, recipients, results FROM campaigns
    WHERE (recipients IS NOT NULL AND jsonb_array_length(recipients) > 0)
       OR (results IS NOT NULL AND jsonb_array_length(results) > 0)`).catch(() => ({ rows: [] }));
  for (const row of legacy.rows) {
    await pool.query('BEGIN');
    try {
      const recipients = Array.isArray(row.recipients) ? row.recipients : [];
      for (let i = 0; i < recipients.length; i += 1) {
        const recipient = recipients[i] || {};
        await pool.query(
          `INSERT INTO campaign_recipients(campaign_id,recipient_index,phone,recipient)
           VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING`,
          [row.id, i, String(recipient.phone || recipient.number || ''), JSON.stringify(recipient)]
        );
      }
      const results = Array.isArray(row.results) ? row.results : [];
      for (const result of results) {
        await pool.query(
          `INSERT INTO campaign_results(campaign_id,recipient_index,phone,ok,message,timestamp)
           VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
          [row.id, result.index, String(result.phone || ''), Boolean(result.ok), result.message || null, result.timestamp || new Date().toISOString()]
        );
      }
      await pool.query('COMMIT');
    } catch (error) { await pool.query('ROLLBACK'); throw error; }
  }
  await pool.query(`ALTER TABLE campaigns DROP COLUMN IF EXISTS recipients, DROP COLUMN IF EXISTS results`);
}

export async function closeDatabase() { await pool.end(); }
