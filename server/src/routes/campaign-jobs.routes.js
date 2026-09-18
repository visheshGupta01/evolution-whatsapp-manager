import { Router } from 'express';
import { createCampaign, getCampaign, listCampaigns, updateCampaign } from '../services/campaign.store.js';
import { cancelCampaign, enqueueCampaign, getQueueSize, pauseCampaign, resumeCampaign } from '../services/campaign.worker.js';

export const campaignJobsRouter = Router();

const MAX_RECIPIENTS = 250;
const MIN_DELAY_MS = 1200;
const MAX_DELAY_MS = 10000;
const MAX_BUTTONS = 3;
const MAX_LIST_ROWS = 10;

function validateCampaign(body) {
  const type = String(body?.type || '').trim();
  if (!['text', 'media', 'media-text', 'buttons', 'list', 'media-buttons', 'media-list'].includes(type)) throw Object.assign(new Error('Unsupported campaign type.'), { status: 400 });
  const instance = String(body?.instance || '').trim();
  if (!instance) throw Object.assign(new Error('Instance is required.'), { status: 400 });
  const recipients = Array.isArray(body?.recipients) ? body.recipients : [];
  if (!recipients.length) throw Object.assign(new Error('At least one recipient is required.'), { status: 400 });
  if (recipients.length > MAX_RECIPIENTS) throw Object.assign(new Error(`A campaign is limited to ${MAX_RECIPIENTS} recipients.`), { status: 400 });
  const delayMs = Math.max(MIN_DELAY_MS, Math.min(Number.isFinite(Number(body?.delayMs)) ? Number(body.delayMs) : 1500, MAX_DELAY_MS));
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
  if (type === 'text' && !String(payload.text || '').trim()) throw Object.assign(new Error('Message text is required.'), { status: 400 });
  if (['media', 'media-text', 'media-buttons', 'media-list'].includes(type) && !payload.media?.base64) throw Object.assign(new Error('Media is required.'), { status: 400 });
  if (type === 'media-text' && !String(payload.caption || '').trim()) throw Object.assign(new Error('Caption is required.'), { status: 400 });
  if (['buttons', 'media-buttons'].includes(type) && (!String(payload.title || '').trim() || !Array.isArray(payload.buttons) || !payload.buttons.length || payload.buttons.length > MAX_BUTTONS)) throw Object.assign(new Error('Button campaign requires a title and 1–3 buttons.'), { status: 400 });
  if (['list', 'media-list'].includes(type)) {
    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    const rows = sections.reduce((n, s) => n + (Array.isArray(s.rows) ? s.rows.length : 0), 0);
    if (!String(payload.title || '').trim() || !String(payload.buttonText || '').trim() || !sections.length || rows < 1 || rows > MAX_LIST_ROWS) throw Object.assign(new Error('List campaign requires a title, menu button and 1–10 rows.'), { status: 400 });
  }
  return { type, instance, recipients, delayMs, payload };
}

campaignJobsRouter.get('/', async (req, res, next) => {
  try { res.json(await listCampaigns({ limit: req.query.limit })); } catch (error) { next(error); }
});

campaignJobsRouter.get('/queue/status', (_req, res) => res.json({ queueSize: getQueueSize() }));

campaignJobsRouter.post('/:id/retry-failed', async (req, res, next) => {
  try {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, message: 'Campaign not found.' });
    const failed = (campaign.results || []).filter((item) => !item.ok);
    if (!failed.length) return res.status(409).json({ ok: false, message: 'There are no failed recipients to retry.' });
    const recipients = failed.map((item) => campaign.recipients[item.index]).filter(Boolean);
    const retry = await createCampaign({
      name: `${campaign.name} · Retry failed`,
      type: campaign.type,
      instance: campaign.instance,
      recipients,
      delayMs: campaign.delayMs,
      payload: campaign.payload,
    });
    enqueueCampaign(retry.id);
    return res.status(202).json(retry);
  } catch (error) { next(error); }
});

campaignJobsRouter.get('/:id', async (req, res, next) => {
  try {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, message: 'Campaign not found.' });
    return res.json(campaign);
  } catch (error) { next(error); }
});

campaignJobsRouter.post('/:id/pause', async (req, res, next) => {
  try {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, message: 'Campaign not found.' });
    if (!['queued', 'running'].includes(campaign.status)) return res.status(409).json({ ok: false, message: 'Campaign cannot be paused in its current state.' });
    pauseCampaign(campaign.id);
    return res.json(await updateCampaignStatus(campaign.id, 'paused'));
  } catch (error) { next(error); }
});

campaignJobsRouter.post('/:id/resume', async (req, res, next) => {
  try {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, message: 'Campaign not found.' });
    if (campaign.status !== 'paused') return res.status(409).json({ ok: false, message: 'Only paused campaigns can be resumed.' });
    resumeCampaign(campaign.id);
    return res.json(await updateCampaignStatus(campaign.id, 'queued'));
  } catch (error) { next(error); }
});

campaignJobsRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, message: 'Campaign not found.' });
    if (!['queued', 'running', 'paused'].includes(campaign.status)) return res.status(409).json({ ok: false, message: 'Campaign cannot be cancelled in its current state.' });
    cancelCampaign(campaign.id);
    return res.json(await updateCampaignStatus(campaign.id, 'cancelled'));
  } catch (error) { next(error); }
});

async function updateCampaignStatus(id, status) {
  const { updateCampaign } = await import('../services/campaign.store.js');
  return updateCampaign(id, { status });
}

campaignJobsRouter.post('/', async (req, res, next) => {
  try {
    const input = validateCampaign(req.body);
    const campaign = await createCampaign({ ...input, name: req.body?.name });
    enqueueCampaign(campaign.id);
    return res.status(202).json(campaign);
  } catch (error) { next(error); }
});campaignJobsRouter.get('/analytics', async (req, res, next) => {
  try {
    const days = Math.max(7, Math.min(Number(req.query.days) || 30, 90));
    const [overview, daily, campaignRows] = await Promise.all([
      pool.query(`
        WITH scoped AS (
          SELECT id, total, sent, failed, status
          FROM campaigns
          WHERE created_at >= CURRENT_DATE - ($1::int - 1)
        ),
        latest AS (
          SELECT DISTINCT ON (cm.campaign_id, cm.recipient_index)
            cm.campaign_id, cm.recipient_index, cm.status
          FROM campaign_messages cm
          JOIN scoped s ON s.id = cm.campaign_id
          ORDER BY cm.campaign_id, cm.recipient_index,
            CASE cm.status
              WHEN 'PLAYED' THEN 6
              WHEN 'READ' THEN 5
              WHEN 'DELIVERY_ACK' THEN 4
              WHEN 'SERVER_ACK' THEN 3
              WHEN 'PENDING' THEN 2
              WHEN 'ERROR' THEN 1
              ELSE 0
            END DESC,
            cm.status_updated_at DESC
        )
        SELECT
          COALESCE(SUM(total), 0)::int AS total_recipients,
          COALESCE(SUM(sent), 0)::int AS sent,
          COALESCE(SUM(failed), 0)::int AS failed,
          COUNT(*)::int AS campaigns,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
          COUNT(*) FILTER (WHERE status = 'running')::int AS running,
          COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
          COUNT(*) FILTER (WHERE status = 'paused')::int AS paused,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_campaigns,
          (SELECT COUNT(*) FROM latest WHERE status IN ('DELIVERY_ACK','READ','PLAYED'))::int AS delivered,
          (SELECT COUNT(*) FROM latest WHERE status IN ('READ','PLAYED'))::int AS read,
          (SELECT COUNT(*) FROM latest WHERE status = 'PLAYED')::int AS played
        FROM scoped
      `, [days]),
      pool.query(`
        WITH dates AS (
          SELECT generate_series(
            CURRENT_DATE - ($1::int - 1),
            CURRENT_DATE,
            interval '1 day'
          )::date AS day
        ),
        result_daily AS (
          SELECT DATE(r.timestamp) AS day,
            COUNT(*) FILTER (WHERE r.ok)::int AS sent,
            COUNT(*) FILTER (WHERE NOT r.ok)::int AS failed
          FROM campaign_results r
          JOIN campaigns c ON c.id = r.campaign_id
          WHERE c.created_at >= CURRENT_DATE - ($1::int - 1)
            AND r.timestamp >= CURRENT_DATE - ($1::int - 1)
          GROUP BY DATE(r.timestamp)
        ),
        delivery_daily AS (
          SELECT DATE(m.status_updated_at) AS day,
            COUNT(*) FILTER (WHERE m.status IN ('DELIVERY_ACK','READ','PLAYED'))::int AS delivered,
            COUNT(*) FILTER (WHERE m.status IN ('READ','PLAYED'))::int AS read
          FROM campaign_messages m
          JOIN campaigns c ON c.id = m.campaign_id
          WHERE c.created_at >= CURRENT_DATE - ($1::int - 1)
            AND m.status_updated_at >= CURRENT_DATE - ($1::int - 1)
          GROUP BY DATE(m.status_updated_at)
        )
        SELECT d.day,
          COALESCE(r.sent, 0)::int AS sent,
          COALESCE(r.failed, 0)::int AS failed,
          COALESCE(m.delivered, 0)::int AS delivered,
          COALESCE(m.read, 0)::int AS read
        FROM dates d
        LEFT JOIN result_daily r ON r.day = d.day
        LEFT JOIN delivery_daily m ON m.day = d.day
        ORDER BY d.day
      `, [days]),
      pool.query(`
        SELECT c.id, c.name, c.type, c.status, c.total, c.sent, c.failed,
          COALESCE(cm.message_count, 0)::int AS message_count,
          COALESCE(cm.delivered, 0)::int AS delivered,
          COALESCE(cm.read, 0)::int AS read
        FROM campaigns c
        LEFT JOIN LATERAL (
          SELECT
            (SELECT COUNT(*) FROM campaign_messages WHERE campaign_id = c.id)::int AS message_count,
            (SELECT COUNT(*) FROM (
              SELECT recipient_index, MAX(
                CASE status
                  WHEN 'PLAYED' THEN 6
                  WHEN 'READ' THEN 5
                  WHEN 'DELIVERY_ACK' THEN 4
                  WHEN 'SERVER_ACK' THEN 3
                  WHEN 'PENDING' THEN 2
                  WHEN 'ERROR' THEN 1
                  ELSE 0
                END
              ) AS rank
              FROM campaign_messages
              WHERE campaign_id = c.id
              GROUP BY recipient_index
            ) latest_recipient WHERE rank >= 4)::int AS delivered,
            (SELECT COUNT(*) FROM (
              SELECT recipient_index, MAX(
                CASE status
                  WHEN 'PLAYED' THEN 6
                  WHEN 'READ' THEN 5
                  WHEN 'DELIVERY_ACK' THEN 4
                  WHEN 'SERVER_ACK' THEN 3
                  WHEN 'PENDING' THEN 2
                  WHEN 'ERROR' THEN 1
                  ELSE 0
                END
              ) AS rank
              FROM campaign_messages
              WHERE campaign_id = c.id
              GROUP BY recipient_index
            ) latest_recipient WHERE rank >= 5)::int AS read
        ) cm ON true
        WHERE c.created_at >= CURRENT_DATE - ($1::int - 1)
        ORDER BY c.created_at DESC
        LIMIT 100
      `, [days])
    ]);

    const row = overview.rows[0] || {};
    const sent = Number(row.sent || 0);
    const failed = Number(row.failed || 0);
    const delivered = Number(row.delivered || 0);
    const read = Number(row.read || 0);
    const totalRecipients = Number(row.total_recipients || 0);

    res.json({
      days,
      overview: {
        campaigns: Number(row.campaigns || 0),
        completed: Number(row.completed || 0),
        running: Number(row.running || 0),
        queued: Number(row.queued || 0),
        paused: Number(row.paused || 0),
        cancelled: Number(row.cancelled || 0),
        failedCampaigns: Number(row.failed_campaigns || 0),
        totalRecipients,
        sent,
        failed,
        remaining: Math.max(0, totalRecipients - sent - failed),
        delivered,
        read,
        played: Number(row.played || 0),
        deliveryRate: sent ? Number(((delivered / sent) * 100).toFixed(1)) : 0,
        readRate: sent ? Number(((read / sent) * 100).toFixed(1)) : 0,
        failureRate: sent ? Number(((failed / sent) * 100).toFixed(1)) : 0
      },
      daily: daily.rows.map(r => ({
        date: r.day,
        sent: Number(r.sent),
        failed: Number(r.failed),
        delivered: Number(r.delivered),
        read: Number(r.read)
      })),
      campaigns: campaignRows.rows.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        status: r.status,
        total: Number(r.total),
        sent: Number(r.sent),
        failed: Number(r.failed),
        messageCount: Number(r.message_count),
        delivered: Number(r.delivered),
        read: Number(r.read),
        deliveryRate: Number(r.sent) ? Number(((Number(r.delivered) / Number(r.sent)) * 100).toFixed(1)) : 0,
        readRate: Number(r.sent) ? Number(((Number(r.read) / Number(r.sent)) * 100).toFixed(1)) : 0
      }))
    });
  } catch (error) { next(error); }
});
campaignJobsRouter.post('/:id/retry-failed', async (req, res, next) => {
  try {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, message: 'Campaign not found.' });
    const failed = (campaign.results || []).filter((item) => !item.ok);
    if (!failed.length) return res.status(409).json({ ok: false, message: 'There are no failed recipients to retry.' });
    const recipients = failed.map((item) => campaign.recipients[item.index]).filter(Boolean);
    const retry = await createCampaign({
      name: `${campaign.name} · Retry failed`,
      type: campaign.type,
      instance: campaign.instance,
      recipients,
      delayMs: campaign.delayMs,
      payload: campaign.payload,
    });
    enqueueCampaign(retry.id);
    return res.status(202).json(retry);
  } catch (error) { next(error); }
});

campaignJobsRouter.get('/:id', async (req, res, next) => {
  try {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, message: 'Campaign not found.' });
    return res.json(campaign);
  } catch (error) { next(error); }
});

campaignJobsRouter.post('/:id/pause', async (req, res, next) => {
  try {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, message: 'Campaign not found.' });
    if (!['queued', 'running'].includes(campaign.status)) return res.status(409).json({ ok: false, message: 'Campaign cannot be paused in its current state.' });
    pauseCampaign(campaign.id);
    return res.json(await updateCampaignStatus(campaign.id, 'paused'));
  } catch (error) { next(error); }
});

campaignJobsRouter.post('/:id/resume', async (req, res, next) => {
  try {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, message: 'Campaign not found.' });
    if (campaign.status !== 'paused') return res.status(409).json({ ok: false, message: 'Only paused campaigns can be resumed.' });
    resumeCampaign(campaign.id);
    return res.json(await updateCampaignStatus(campaign.id, 'queued'));
  } catch (error) { next(error); }
});

campaignJobsRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ ok: false, message: 'Campaign not found.' });
    if (!['queued', 'running', 'paused'].includes(campaign.status)) return res.status(409).json({ ok: false, message: 'Campaign cannot be cancelled in its current state.' });
    cancelCampaign(campaign.id);
    return res.json(await updateCampaignStatus(campaign.id, 'cancelled'));
  } catch (error) { next(error); }
});

async function updateCampaignStatus(id, status) {
  const { updateCampaign } = await import('../services/campaign.store.js');
  return updateCampaign(id, { status });
}

campaignJobsRouter.post('/', async (req, res, next) => {
  try {
    const input = validateCampaign(req.body);
    const campaign = await createCampaign({ ...input, name: req.body?.name });
    enqueueCampaign(campaign.id);
    return res.status(202).json(campaign);
  } catch (error) { next(error); }
});
