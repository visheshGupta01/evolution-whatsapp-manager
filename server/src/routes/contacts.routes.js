import { Router } from 'express';
import { listContacts } from '../services/contact.service.js';

export const contactsRouter = Router();

contactsRouter.get('/:instance', async (req, res, next) => {
  try {
    const instance = String(req.params.instance || '').trim();
    if (!instance) return res.status(400).json({ ok: false, message: 'instance is required' });
    res.json(await listContacts(instance));
  } catch (error) {
    next(error);
  }
});
