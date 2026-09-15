import { Router } from 'express';
import { sendButtons, sendList, sendMedia, sendText } from '../services/evolution.service.js';

export const campaignsRouter = Router();

const MAX_RECIPIENTS = 250;
const MIN_DELAY_MS = 1200;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const MAX_BUTTONS = 3;
const MAX_LIST_ROWS = 10;

function normalizeNumber(value) {
  return String(value ?? '').trim().replace(/[^0-9]/g, '');
}

function personalize(template, recipient) {
  return String(template).replace(/\{\{\s*(name|company|custom1|custom2)\s*\}\}/gi, (_, key) => {
    const value = recipient?.[key.toLowerCase()];
    return value == null ? '' : String(value);
  });
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function campaignDelay(body) { const requested = Number(body?.delayMs || MIN_DELAY_MS); return Math.max(MIN_DELAY_MS, Math.min(Number.isFinite(requested) ? requested : MIN_DELAY_MS, 10000)); }
function validateRecipients(recipients) {
  if (!Array.isArray(recipients) || !recipients.length) throw Object.assign(new Error('At least one valid recipient is required.'), { status: 400 });
  if (recipients.length > MAX_RECIPIENTS) throw Object.assign(new Error(`A single campaign is limited to ${MAX_RECIPIENTS} recipients in this phase.`), { status: 400 });
}
function resultResponse(res, results) { const sent = results.filter((item) => item.ok).length; return res.json({ ok: sent > 0, total: results.length, sent, failed: results.length - sent, results }); }

async function runCampaign(recipients, delayMs, sender) {
  const results = [];
  for (let index = 0; index < recipients.length; index += 1) {
    const recipient = recipients[index] || {};
    const number = normalizeNumber(recipient.phone || recipient.number);
    if (!number || number.length < 8 || number.length > 15) {
      results.push({ index, phone: recipient.phone || recipient.number || '', ok: false, message: 'Invalid phone number.' });
    } else {
      try { await sender(number, recipient); results.push({ index, phone: number, ok: true }); }
      catch (error) { results.push({ index, phone: number, ok: false, message: error.message || 'Send failed.' }); }
    }
    if (index < recipients.length - 1) await sleep(delayMs);
  }
  return results;
}

campaignsRouter.post('/text', async (req, res, next) => {
  try {
    const instance = String(req.body?.instance || '').trim(); const text = String(req.body?.text || '').trim(); const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
    if (!instance) return res.status(400).json({ ok: false, message: 'Instance is required.' });
    if (!text) return res.status(400).json({ ok: false, message: 'Message text is required.' });
    validateRecipients(recipients);
    return resultResponse(res, await runCampaign(recipients, campaignDelay(req.body), (number, recipient) => sendText(instance, number, personalize(text, recipient), { delayMs: 0 })));
  } catch (error) { next(error); }
});

campaignsRouter.post('/media', async (req, res, next) => {
  try {
    const instance = String(req.body?.instance || '').trim(); const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : []; const media = req.body?.media || {};
    const caption = String(req.body?.caption || '').trim(); const base64 = String(media.base64 || '').replace(/^data:[^;]+;base64,/, '').trim(); const mediatype = String(media.mediatype || '').trim().toLowerCase(); const mimetype = String(media.mimetype || '').trim(); const fileName = String(media.fileName || 'media').trim();
    if (!instance) return res.status(400).json({ ok: false, message: 'Instance is required.' });
    validateRecipients(recipients); if (!base64) return res.status(400).json({ ok: false, message: 'Media file is required.' });
    if (!['image', 'video', 'document'].includes(mediatype)) return res.status(400).json({ ok: false, message: 'Media type must be image, video or document.' });
    if (!mimetype) return res.status(400).json({ ok: false, message: 'Media MIME type is required.' });
    const estimatedBytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    if (estimatedBytes > MAX_MEDIA_BYTES) return res.status(413).json({ ok: false, message: 'Media is too large. Maximum size is 8 MB in Phase 3.' });
    return resultResponse(res, await runCampaign(recipients, campaignDelay(req.body), (number, recipient) => sendMedia(instance, number, { base64, mediatype, mimetype, fileName }, { caption: personalize(caption, recipient), delayMs: 0 })));
  } catch (error) { next(error); }
});

campaignsRouter.post('/buttons', async (req, res, next) => {
  try {
    const instance = String(req.body?.instance || '').trim(); const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : []; const payload = req.body?.payload || {};
    const buttons = Array.isArray(payload.buttons) ? payload.buttons : [];
    if (!instance) return res.status(400).json({ ok: false, message: 'Instance is required.' });
    validateRecipients(recipients); if (!String(payload.title || '').trim()) return res.status(400).json({ ok: false, message: 'Button title is required.' });
    if (!buttons.length || buttons.length > MAX_BUTTONS) return res.status(400).json({ ok: false, message: `Buttons require 1–${MAX_BUTTONS} items.` });
    const ids = buttons.map((button) => String(button.id || '').trim()); const labels = buttons.map((button) => String(button.displayText || '').trim());
    if (ids.some((id) => !id) || labels.some((label) => !label)) return res.status(400).json({ ok: false, message: 'Every button needs an ID and display text.' });
    if (new Set(ids).size !== ids.length || new Set(labels).size !== labels.length) return res.status(400).json({ ok: false, message: 'Button IDs and labels must be unique.' });
    return resultResponse(res, await runCampaign(recipients, campaignDelay(req.body), (number, recipient) => sendButtons(instance, number, {
      title: personalize(payload.title, recipient), description: personalize(payload.description || '', recipient), footer: personalize(payload.footer || '', recipient), buttons: buttons.map((button) => ({ ...button, id: personalize(button.id, recipient), displayText: personalize(button.displayText, recipient), url: button.url ? personalize(button.url, recipient) : undefined, copyCode: button.copyCode ? personalize(button.copyCode, recipient) : undefined, phoneNumber: button.phoneNumber ? personalize(button.phoneNumber, recipient) : undefined })),
    })));
  } catch (error) { next(error); }
});

campaignsRouter.post('/list', async (req, res, next) => {
  try {
    const instance = String(req.body?.instance || '').trim(); const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : []; const payload = req.body?.payload || {};
    const sections = Array.isArray(payload.sections) ? payload.sections : [];
    if (!instance) return res.status(400).json({ ok: false, message: 'Instance is required.' });
    validateRecipients(recipients); if (!String(payload.title || '').trim()) return res.status(400).json({ ok: false, message: 'List title is required.' });
    if (!String(payload.buttonText || '').trim()) return res.status(400).json({ ok: false, message: 'List button text is required.' });
    if (!sections.length) return res.status(400).json({ ok: false, message: 'At least one list section is required.' });
    const rowCount = sections.reduce((total, section) => total + (Array.isArray(section.rows) ? section.rows.length : 0), 0);
    if (rowCount < 1 || rowCount > MAX_LIST_ROWS) return res.status(400).json({ ok: false, message: `Lists support 1–${MAX_LIST_ROWS} rows in this phase.` });
    const cleanSections = sections.map((section) => ({ title: personalize(section.title || '', recipients[0]), rows: (section.rows || []).map((row) => ({ title: personalize(row.title || '', recipients[0]), description: personalize(row.description || '', recipients[0]), rowId: personalize(row.rowId || '', recipients[0]) })) }));
    return resultResponse(res, await runCampaign(recipients, campaignDelay(req.body), (number, recipient) => sendList(instance, number, {
      title: personalize(payload.title, recipient), description: personalize(payload.description || '', recipient), footerText: personalize(payload.footerText || '', recipient), buttonText: personalize(payload.buttonText, recipient), sections: sections.map((section) => ({ title: personalize(section.title || '', recipient), rows: (section.rows || []).map((row) => ({ title: personalize(row.title || '', recipient), description: personalize(row.description || '', recipient), rowId: personalize(row.rowId || '', recipient) })) })),
    })));
  } catch (error) { next(error); }
});
