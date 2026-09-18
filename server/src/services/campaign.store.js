import { pool } from './db.js';

function iso(value) { return value?.toISOString?.() || value || null; }
function baseCampaign(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, type: row.type, instance: row.instance, status: row.status,
    delayMs: row.delay_ms, payload: row.payload || {}, total: row.total, sent: row.sent, failed: row.failed,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), startedAt: iso(row.started_at),
    completedAt: iso(row.completed_at), error: row.error || undefined,
  };
}
async function attachData(campaign) {
  if (!campaign) return null;
  const [recipients, results] = await Promise.all([
    pool.query('SELECT recipient_index, recipient FROM campaign_recipients WHERE campaign_id=$1 ORDER BY recipient_index', [campaign.id]),
    pool.query('SELECT recipient_index AS index, phone, ok, message, timestamp FROM campaign_results WHERE campaign_id=$1 ORDER BY recipient_index', [campaign.id]),
  ]);
  return {
    ...campaign,
    recipients: recipients.rows.map((row) => row.recipient || {}),
    results: results.rows.map((row) => ({ index: row.index, phone: row.phone, ok: row.ok, message: row.message || undefined, timestamp: iso(row.timestamp) })),
  };
}
export async function listCampaigns({ limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const { rows } = await pool.query('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT $1', [safeLimit]);
  return Promise.all(rows.map((row) => attachData(baseCampaign(row))));
}
export async function getCampaign(id) {
  const { rows } = await pool.query('SELECT * FROM campaigns WHERE id=$1 LIMIT 1', [id]);
  return attachData(baseCampaign(rows[0]));
}
export async function createCampaign(input) {
  const now = new Date().toISOString();
  const campaign = {
    id: cryptoRandomId(), name: String(input.name || 'Untitled campaign').trim() || 'Untitled campaign',
    type: input.type, instance: input.instance, status: 'queued', delayMs: input.delayMs,
    recipients: input.recipients || [], payload: input.payload || {}, total: (input.recipients || []).length,
    sent: 0, failed: 0, results: [], createdAt: now, updatedAt: now, startedAt: null, completedAt: null,
  };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO campaigns(id,name,type,instance,status,delay_ms,payload,total,sent,failed,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)`,
      [campaign.id,campaign.name,campaign.type,campaign.instance,campaign.status,campaign.delayMs,JSON.stringify(campaign.payload),campaign.total,0,0,now,now]
    );
    for (let i = 0; i < campaign.recipients.length; i += 1) {
      const recipient = campaign.recipients[i] || {};
      await client.query(
        `INSERT INTO campaign_recipients(campaign_id,recipient_index,phone,recipient) VALUES($1,$2,$3,$4::jsonb)`,
        [campaign.id,i,String(recipient.phone || recipient.number || ''),JSON.stringify(recipient)]
      );
    }
    await client.query('COMMIT');
    return campaign;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function updateCampaign(id, patch) {
  const current = await getCampaign(id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await pool.query(
    `UPDATE campaigns SET name=$2,type=$3,instance=$4,status=$5,delay_ms=$6,payload=$7::jsonb,total=$8,sent=$9,failed=$10,
      updated_at=$11,started_at=$12,completed_at=$13,error=$14 WHERE id=$1`,
    [id,next.name,next.type,next.instance,next.status,next.delayMs,JSON.stringify(next.payload),next.total,next.sent,next.failed,next.updatedAt,next.startedAt,next.completedAt,next.error || null]
  );
  return next;
}
export async function recordCampaignResult(id, result, counts) {
  const timestamp = result.timestamp || new Date().toISOString();
  await pool.query(
    `INSERT INTO campaign_results(campaign_id,recipient_index,phone,ok,message,timestamp)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT(campaign_id,recipient_index) DO UPDATE SET phone=EXCLUDED.phone,ok=EXCLUDED.ok,message=EXCLUDED.message,timestamp=EXCLUDED.timestamp`,
    [id,result.index,result.phone || '',Boolean(result.ok),result.message || null,timestamp]
  );
  return updateCampaign(id, { sent: counts.sent, failed: counts.failed });
}
function cryptoRandomId() { return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`; }
