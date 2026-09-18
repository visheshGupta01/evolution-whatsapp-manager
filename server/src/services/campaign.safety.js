import { pool } from './db.js';

function safetyError(message, status = 429) {
  return Object.assign(new Error(message), { status });
}

export async function enforceCampaignSafety({ instance, recipients, delayMs }) {
  const count = Array.isArray(recipients) ? recipients.length : 0;
  if (!count) throw safetyError('A campaign must contain at least one recipient.', 400);

  const normalized = recipients.map((recipient) => String(recipient?.phone || recipient?.number || '').replace(/[^0-9]/g, ''));
  const seen = new Set();
  const duplicates = [];
  for (const phone of normalized) {
    if (seen.has(phone)) duplicates.push(phone);
    else if (phone) seen.add(phone);
  }
  if (duplicates.length) {
    throw safetyError(`Campaign contains duplicate recipients. Remove duplicate phone numbers before sending.`, 400);
  }

  const minDelay = Number(process.env.CAMPAIGN_MIN_DELAY_MS || 1500);
  if (!Number.isFinite(delayMs) || delayMs < minDelay) {
    throw safetyError(`Campaign pacing must be at least ${minDelay} ms between recipients.`, 400);
  }

  const maxActive = Number(process.env.CAMPAIGN_MAX_ACTIVE || 1);
  const active = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM campaigns
     WHERE status IN ('queued','running','paused')`
  );
  if (Number(active.rows[0]?.count || 0) >= maxActive) {
    throw safetyError(`Only ${maxActive} active campaign${maxActive === 1 ? '' : 's'} can run at a time.`, 409);
  }

  const dailyLimit = Number(process.env.CAMPAIGN_DAILY_RECIPIENT_LIMIT || 1000);
  const usage = await pool.query(
    `SELECT
       COALESCE(SUM(
         CASE
           WHEN status IN ('queued','running','paused') THEN GREATEST(total - sent - failed, 0)
           ELSE sent + failed
         END
       ), 0)::int AS reserved
     FROM campaigns
     WHERE created_at >= CURRENT_DATE
       AND status <> 'cancelled'`
  );
  const used = Number(usage.rows[0]?.reserved || 0);
  if (used + count > dailyLimit) {
    throw safetyError(
      `Daily campaign limit reached. Remaining campaign capacity is ${Math.max(0, dailyLimit - used)} recipients.`,
      429
    );
  }

  const recent = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM campaigns
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 minute')`,
    [Number(process.env.CAMPAIGN_CREATE_WINDOW_MINUTES || 10)]
  );
  const creationLimit = Number(process.env.CAMPAIGN_CREATE_LIMIT || 10);
  if (Number(recent.rows[0]?.count || 0) >= creationLimit) {
    throw safetyError('Too many campaigns were created recently. Wait before creating another campaign.', 429);
  }

  return { ok: true, dailyUsed: used, dailyLimit };
}

export function shouldAutoPause(results) {
  const completed = results.length;
  const minimumSamples = Number(process.env.CAMPAIGN_AUTO_PAUSE_MIN_RESULTS || 20);
  const maxFailureRate = Number(process.env.CAMPAIGN_AUTO_PAUSE_FAILURE_RATE || 0.35);
  if (completed < minimumSamples) return false;
  const failed = results.filter((result) => !result.ok).length;
  return failed / completed >= maxFailureRate;
}
