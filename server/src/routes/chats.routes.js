import { Router } from 'express';
import { listChats, listMessages, sendText } from '../services/chat.service.js';

export const chatsRouter = Router();

function instance(req) {
  return String(req.params.instance || '').trim();
}

function requireInstance(req, res) {
  const value = instance(req);
  if (!value) {
    res.status(400).json({ ok: false, message: 'instance is required' });
    return null;
  }
  return value;
}

chatsRouter.get('/:instance', async (req, res, next) => {
  try {
    const value = requireInstance(req, res);
    if (!value) return;
    res.json(await listChats(value));
  } catch (error) {
    next(error);
  }
});

chatsRouter.get('/:instance/:remoteJid/messages', async (req, res, next) => {
  try {
    const value = requireInstance(req, res);
    if (!value) return;
    const remoteJid = decodeURIComponent(String(req.params.remoteJid || '')).trim();
    if (!remoteJid) return res.status(400).json({ ok: false, message: 'remoteJid is required' });
    res.json(await listMessages(value, remoteJid));
  } catch (error) {
    next(error);
  }
});

chatsRouter.post('/:instance/:remoteJid/messages', async (req, res, next) => {
  try {
    const value = requireInstance(req, res);
    if (!value) return;
    const remoteJid = decodeURIComponent(String(req.params.remoteJid || '')).trim();
    const text = String(req.body?.text || '').trim();
    if (!remoteJid || !text) {
      return res.status(400).json({ ok: false, message: 'remoteJid and text are required' });
    }
    const number = remoteJid.replace(/@s\.whatsapp\.net$/, '').replace(/\D/g, '');
    res.status(201).json(await sendText(value, number || remoteJid, text));
  } catch (error) {
    next(error);
  }
});
