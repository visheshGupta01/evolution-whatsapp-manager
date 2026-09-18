import { Router } from 'express';
import { config } from '../config.js';
import { updateCampaignMessageStatus } from '../services/campaign.store.js';

export const webhooksRouter = Router();

const STATUS_MAP = {
  'ERROR': 'ERROR',
  'PENDING': 'PENDING',
  'SERVER_ACK': 'SERVER_ACK',
  'DELIVERY_ACK': 'DELIVERY_ACK',
  'READ': 'READ',
  'DELETED': 'DELETED',
  'PLAYED': 'PLAYED',
  0: 'ERROR',
  1: 'PENDING',
  2: 'SERVER_ACK',
  3: 'DELIVERY_ACK',
  4: 'READ',
  5: 'PLAYED',
};

function validWebhook(req) {
  const expected = config.evolutionKey;
  if (!expected) return true;
  const payloadKey = req.body?.apikey || req.body?.apiKey;
  const headerKey = req.get('x-api-key') || req.get('x-webhook-secret') || String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return payloadKey === expected || headerKey === expected;
}

function extractUpdates(body) {
  const data = body?.data ?? body?.message ?? body;
  const items = Array.isArray(data) ? data : [data];
  return items.map((item) => {
    const key = item?.key || item?.update?.key || item?.data?.key || {};
    const rawStatus = item?.update?.status ?? item?.status ?? item?.data?.update?.status;
    return { messageId: key?.id || item?.messageId || item?.id, status: STATUS_MAP[rawStatus] || String(rawStatus || '').toUpperCase(), instance: body?.instance || body?.data?.instance };
  }).filter((item) => item.messageId && item.status);
}

async function handle(req, res) {
  if (!validWebhook(req)) return res.status(401).json({ ok: false, message: 'Invalid webhook credentials.' });
  try {
    const updates = extractUpdates(req.body);
    let updated = 0;
    for (const update of updates) {
      if (!STATUS_MAP[update.status] && !Object.values(STATUS_MAP).includes(update.status)) continue;
      const result = await updateCampaignMessageStatus(update.messageId, update.status);
      if (result) updated += 1;
    }
    return res.json({ ok: true, updated });
  } catch (error) {
    console.error('[webhook] delivery update failed:', error);
    return res.status(500).json({ ok: false, message: 'Webhook processing failed.' });
  }
}

webhooksRouter.post('/evolution', handle);
webhooksRouter.post('/evolution/:event', handle);
