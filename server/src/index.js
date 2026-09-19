import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config, assertConfiguration } from './config.js';
import { registerMiddleware, errorHandler } from './middleware-v2.js';
import { healthRouter } from './routes/health.routes.js';
import { sessionsRouter } from './routes/sessions.routes.js';
import { campaignsRouter } from './routes/campaigns.routes.js';
import { campaignJobsRouter } from './routes/campaign-jobs.routes.js';
import { recoverCampaigns } from './services/campaign.worker.js';
import { initDatabase, closeDatabase } from './services/db.js';
import { templatesRouter } from './routes/templates.routes.js';
import { webhooksRouter } from './routes/webhooks.routes.js';
import { audiencesRouter } from './routes/audiences.routes.js';
import { crmRouter } from './routes/crm.routes.js';
import { inboxRouter } from './routes/inbox.routes.js';
import { automationRouter } from './routes/automation.routes.js';

assertConfiguration();
await initDatabase();
const app = express();
registerMiddleware(app);

app.get('/api', (_req, res) => res.json({
  ok: true,
  name: 'Evolution WhatsApp Manager API',
  version: '1.7.0',
  features: { sessions: true, textCampaigns: true, mediaCampaigns: true, interactiveCampaigns: true, persistentCampaigns: true },
}));
app.use('/api/health', healthRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/campaign-jobs', campaignJobsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/audiences', audiencesRouter);
app.use('/api/crm', crmRouter);
app.use('/api/inbox', inboxRouter);
app.use('/api/automations', automationRouter);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (error) => error ? next() : undefined);
});
app.use(errorHandler);

const server = http.createServer(app);
server.listen(config.port, () => {
  void recoverCampaigns().catch((error) => console.error('[campaign-worker] recovery failed:', error));
  console.log(`[server] Evolution WhatsApp Manager listening on http://localhost:${config.port}`);
  console.log(`[server] Evolution API: ${config.evolutionUrl || '(not configured)'}`);
  console.log(`[server] API key: ${config.evolutionKey ? 'configured' : 'MISSING'}`);
});
const shutdown = (signal) => { console.log(`[server] ${signal} received, shutting down`); server.close(async () => { await closeDatabase(); process.exit(0); }); };
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
