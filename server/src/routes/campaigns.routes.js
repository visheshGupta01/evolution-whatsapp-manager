import { Router } from 'express';
import { sendText } from '../services/evolution.service.js';

export const campaignsRouter = Router();

const MAX_RECIPIENTS = 250;
const MIN_DELAY_MS = 1200;

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

campaignsRouter.post('/text', async (req, res, next) => {
  try {
    const instance = String(req.body?.instance || '').trim();
    const text = String(req.body?.text || '').trim();
    const recipients = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
    const requestedDelay = Number(req.body?.delayMs || MIN_DELAY_MS);
    const delayMs = Math.max(MIN_DELAY_MS, Math.min(Number.isFinite(requestedDelay) ? requestedDelay : MIN_DELAY_MS, 10000));

    if (!instance) return res.status(400).json({ ok: false, message: 'Instance is required.' });
    if (!text) return res.status(400).json({ ok: false, message: 'Message text is required.' });
    if (!recipients.length) return res.status(400).json({ ok: false, message: 'At least one valid recipient is required.' });
    if (recipients.length > MAX_RECIPIENTS) return res.status(400).json({ ok: false, message: `A single campaign is limited to ${MAX_RECIPIENTS} recipients in this phase.` });

    const results = [];
    for (let index = 0; index < recipients.length; index += 1) {
      const recipient = recipients[index] || {};
      const number = normalizeNumber(recipient.phone || recipient.number);
      if (!number || number.length < 8 || number.length > 15) {
        results.push({ index, phone: recipient.phone || recipient.number || '', ok: false, message: 'Invalid phone number.' });
        continue;
      }

      try {
        const personalizedText = personalize(text, recipient);
        await sendText(instance, number, personalizedText, { delayMs: 0 });
        results.push({ index, phone: number, ok: true });
      } catch (error) {
        results.push({ index, phone: number, ok: false, message: error.message || 'Send failed.' });
      }

      if (index < recipients.length - 1) await sleep(delayMs);
    }

    const sent = results.filter((item) => item.ok).length;
    res.json({ ok: sent > 0, total: results.length, sent, failed: results.length - sent, results });
  } catch (error) {
    next(error);
  }
});
