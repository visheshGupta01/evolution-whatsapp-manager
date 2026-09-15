import { Router } from 'express';
import { config } from '../config.js';
import { connectInstance, createInstance, deleteInstance, listInstances, logoutInstance, restartInstance } from '../services/evolution.service.js';

export const sessionsRouter = Router();
const instance = (req) => String(req.params.instance || '').trim();

sessionsRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await listInstances());
  } catch (error) {
    next(error);
  }
});

sessionsRouter.post('/', async (req, res, next) => {
  try {
    const instanceName = String(req.body?.instanceName || '').trim().toLowerCase();
    if (!config.instanceNamePattern.test(instanceName)) {
      return res.status(400).json({
        ok: false,
        message: 'Instance name must contain only lowercase letters, numbers, _ or -, and be 1-64 characters.',
      });
    }
    res.status(201).json(await createInstance(instanceName));
  } catch (error) {
    next(error);
  }
});

sessionsRouter.get('/:instance/connect', async (req, res, next) => {
  try {
    res.json(await connectInstance(instance(req)));
  } catch (error) {
    next(error);
  }
});

sessionsRouter.get('/:instance/qr', async (req, res, next) => {
  try {
    res.json(await connectInstance(instance(req)));
  } catch (error) {
    next(error);
  }
});

sessionsRouter.post('/:instance/restart', async (req, res, next) => {
  try {
    res.json(await restartInstance(instance(req)));
  } catch (error) {
    next(error);
  }
});

sessionsRouter.post('/:instance/disconnect', async (req, res, next) => {
  try {
    res.json(await logoutInstance(instance(req)));
  } catch (error) {
    next(error);
  }
});

sessionsRouter.delete('/:instance', async (req, res, next) => {
  try {
    res.json(await deleteInstance(instance(req)));
  } catch (error) {
    next(error);
  }
});
