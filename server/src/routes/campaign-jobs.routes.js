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
  if (!['text', 'media', 'media-text', 'buttons', 'list'].includes(type)) throw Object.assign(new Error('Unsupported campaign type.'), { status: 400 });
  const instance = String(body?.instance || '').trim();
  if (!instance) throw Object.assign(new Error('Instance is required.'), { status: 400 });
  const recipients = Array.isArray(body?.recipients) ? body.recipients : [];
  if (!recipients.length) throw Object.assign(new Error('At least one recipient is required.'), { status: 400 });
  if (recipients.length > MAX_RECIPIENTS) throw Object.assign(new Error(`A campaign is limited to ${MAX_RECIPIENTS} recipients.`), { status: 400 });
  const delayMs = Math.max(MIN_DELAY_MS, Math.min(Number.isFinite(Number(body?.delayMs)) ? Number(body.delayMs) : 1500, MAX_DELAY_MS));
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
  if (type === 'text' && !String(payload.text || '').trim()) throw Object.assign(new Error('Message text is required.'), { status: 400 });
  if ((type === 'media' || type === 'media-text') && !payload.media?.base64) throw Object.assign(new Error('Media is required.'), { status: 400 });
  if (type === 'media-text' && !String(payload.caption || '').trim()) throw Object.assign(new Error('Caption is required.'), { status: 400 });
  if (type === 'buttons' && (!String(payload.title || '').trim() || !Array.isArray(payload.buttons) || !payload.buttons.length || payload.buttons.length > MAX_BUTTONS)) throw Object.assign(new Error('Button campaign requires a title and 1–3 buttons.'), { status: 400 });
  if (type === 'list') {
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
});
