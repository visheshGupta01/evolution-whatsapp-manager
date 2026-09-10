import { Router } from 'express';
import { config } from '../config.js';
import { normalizeEvolutionEvent, verifyWebhookSignature } from '../services/realtime.service.js';
import { broadcastRealtime } from '../services/socket.service.js';

export const webhooksRouter = Router();

webhooksRouter.post('/evolution', (req, res, next) => {
  try {
    const signature = req.get('x-evolution-signature') || req.get('x-webhook-signature');
    const rawBody = JSON.stringify(req.body ?? {});

    if (!verifyWebhookSignature(rawBody, signature, config.webhookSecret)) {
      return res.status(401).json({ ok: false, message: 'Invalid webhook signature' });
    }

    const event = normalizeEvolutionEvent(req.body);
    broadcastRealtime(event);
    res.status(202).json({ ok: true, eventId: event.id });
  } catch (error) {
    next(error);
  }
});
