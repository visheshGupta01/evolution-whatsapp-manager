import { Router } from 'express';
import { sendMedia, sendText } from '../services/evolution.service.js';

export const campaignsRouter = Router();

const MAX_RECIPIENTS = 250;
const MIN_DELAY_MS = 1200;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

function normalizeNumber(value) {
  const raw = String(value ?? '').trim();
  return raw.replace(/[^0-9]/g, '');
}

function personalize(template, recipient) {
  return String(template).replace(/\{\{\s*(name|company|custom1|custom2)\s*\}\}/gi, (_, key) => {
    const value = recipient?.[key.toLowerCase()];
    return value == null ? '' : String(value);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function campaignDelay(body) {
  const requested = Number(body?.delayMs || MIN_DELAY_MS);
  return Math.max(MIN_DELAY_MS, Math.min(Number.isFinite(requested) ? requested : MIN_DELAY_MS, 10000));
}

function validateRecipients(recipients) {
  if (!Array.isArray(recipients) || !recipients.length) throw Object.assign(new Error('At least one valid recipient is required.'), { status: 400 });
  if (recipients.length > MAX_RECIPIENTS) throw Object.assign(new Error(`A single campaign is limited to ${MAX_RECIPIENTS} recipients in this phase.`), { status: 400 });
}

function resultResponse(res, results) {
  const sent = results.filter((item) => item.ok).length;
  return res.json({ ok: sent > 0, total: results.length, sent, failed: results.length - sent, results });
}

campaignsRouter.post('/text', async (req, res, next) => {
  try {
    const instance = String(req.body?.instance || '').trim();
    const text = String(req.body?.text || '').trim();
    const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
    const delayMs = campaignDelay(req.body);

    if (!instance) return res.status(400).json({ ok: false, message: 'Instance is required.' });
    if (!text) return res.status(400).json({ ok: false, message: 'Message text is required.' });
    validateRecipients(recipients);

    const results = [];
    for (let index = 0; index < recipients.length; index += 1) {
      const recipient = recipients[index] || {};
      const number = normalizeNumber(recipient.phone || recipient.number);
      if (!number || number.length < 8 || number.length > 15) {
        results.push({ index, phone: recipient.phone || recipient.number || '', ok: false, message: 'Invalid phone number.' });
        continue;
      }
      try {
        await sendText(instance, number, personalize(text, recipient), { delayMs: 0 });
        results.push({ index, phone: number, ok: true });
      } catch (error) {
        results.push({ index, phone: number, ok: false, message: error.message || 'Send failed.' });
      }
      if (index < recipients.length - 1) await sleep(delayMs);
    }
    return resultResponse(res, results);
  } catch (error) {
    next(error);
  }
});

campaignsRouter.post('/media', async (req, res, next) => {
  try {
    const instance = String(req.body?.instance || '').trim();
    const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
    const media = req.body?.media || {};
    const caption = String(req.body?.caption || '').trim();
    const delayMs = campaignDelay(req.body);
    const base64 = String(media.base64 || '').replace(/^data:[^;]+;base64,/, '').trim();
    const mediatype = String(media.mediatype || '').trim().toLowerCase();
    const mimetype = String(media.mimetype || '').trim();
    const fileName = String(media.fileName || 'media').trim();

    if (!instance) return res.status(400).json({ ok: false, message: 'Instance is required.' });
    validateRecipients(recipients);
    if (!base64) return res.status(400).json({ ok: false, message: 'Media file is required.' });
    if (!['image', 'video', 'document'].includes(mediatype)) return res.status(400).json({ ok: false, message: 'Media type must be image, video or document.' });
    if (!mimetype) return res.status(400).json({ ok: false, message: 'Media MIME type is required.' });
    const estimatedBytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (estimatedBytes > MAX_MEDIA_BYTES) return res.status(413).json({ ok: false, message: 'Media is too large. Maximum size is 8 MB in Phase 3.' });

    const results = [];
    for (let index = 0; index < recipients.length; index += 1) {
      const recipient = recipients[index] || {};
      const number = normalizeNumber(recipient.phone || recipient.number);
      if (!number || number.length < 8 || number.length > 15) {
        results.push({ index, phone: recipient.phone || recipient.number || '', ok: false, message: 'Invalid phone number.' });
        continue;
      }
      try {
        const personalizedCaption = personalize(caption, recipient);
        await sendMedia(instance, number, { base64, mediatype, mimetype, fileName }, { caption: personalizedCaption, delayMs: 0 });
        results.push({ index, phone: number, ok: true });
      } catch (error) {
        results.push({ index, phone: number, ok: false, message: error.message || 'Media send failed.' });
      }
      if (index < recipients.length - 1) await sleep(delayMs);
    }
    return resultResponse(res, results);
  } catch (error) {
    next(error);
  }
});
