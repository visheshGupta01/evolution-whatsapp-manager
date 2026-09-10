import { Router } from 'express';
import { config } from '../config.js';
import { health } from '../services/evolution.service.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    const result = await health();
    res.status(result.ok ? 200 : 503).json(result);
  } catch (error) {
    res.status(502).json({ ok: false, evolutionApi: config.evolutionUrl, message: error.message });
  }
});
