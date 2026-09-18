import { pool } from './db.js';

function toCampaign(row) {
  if (!row) return null;
  return {
    id: row.id, name: row.name, type: row.type, instance: row.instance, status: row.status,
    delayMs: row.delay_ms, recipients: row.recipients || [], payload: row.payload || {},
    total: row.total, sent: row.sent, failed: row.failed, results: row.results || [],
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
    startedAt: row.started_at?.toISOString?.() || row.started_at || null,
    completedAt: row.completed_at?.toISOString?.() || row.completed_at || null,
    error: row.error || undefined,
  };
}

export async function listCampaigns({ limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const { rows } = await pool.query('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT $1', [safeLimit]);
  return rows.map(toCampaign);
}

export async function getCampaign(id) {
  const { rows } = await pool.query('SELECT * FROM campaigns WHERE id = $1 LIMIT 1', [id]);
  return toCampaign(rows[0]);
}

export async function createCampaign(input) {
  const now = new Date().toISOString();
  const campaign = {
    id: cryptoRandomId(),
    name: String(input.name || 'Untitled campaign').trim() || 'Untitled campaign',
    type: input.type, instance: input.instance, status: 'queued', delayMs: input.delayMs,
    recipients: input.recipients, payload: input.payload, total: input.recipients.length,
    sent: 0, failed: 0, results: [], createdAt: now, updatedAt: now, startedAt: null, completedAt: null,
  };
  await pool.query(
    `INSERT INTO campaigns
      (id,name,type,instance,status,delay_ms,recipients,payload,total,sent,failed,results,created_at,updated_at,started_at,completed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12::jsonb,$13,$14,$15,$16)`,
    [campaign.id,campaign.name,campaign.type,campaign.instance,campaign.status,campaign.delayMs,
     JSON.stringify(campaign.recipients),JSON.stringify(campaign.payload),campaign.total,campaign.sent,
     campaign.failed,JSON.stringify(campaign.results),now,now,null,null]
  );
  return campaign;
}

export async function updateCampaign(id, patch) {
  const current = await getCampaign(id);
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await pool.query(
    `UPDATE campaigns SET name=$2,type=$3,instance=$4,status=$5,delay_ms=$6,recipients=$7::jsonb,payload=$8::jsonb,
      total=$9,sent=$10,failed=$11,results=$12::jsonb,updated_at=$13,started_at=$14,completed_at=$15,error=$16 WHERE id=$1`,
    [id,next.name,next.type,next.instance,next.status,next.delayMs,JSON.stringify(next.recipients),JSON.stringify(next.payload),
     next.total,next.sent,next.failed,JSON.stringify(next.results),next.updatedAt,next.startedAt,next.completedAt,next.error || null]
  );
  return next;
}

function cryptoRandomId() {
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
