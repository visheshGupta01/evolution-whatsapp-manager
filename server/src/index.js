import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config, assertConfiguration } from './config.js';
import { registerMiddleware, errorHandler } from './middleware-v2.js';
import { healthRouter } from './routes/health.routes.js';
import { sessionsRouter } from './routes/sessions.routes.js';

assertConfiguration();
const app = express();
registerMiddleware(app);

app.get('/api', (_req, res) => res.json({ ok: true, name: 'Evolution WhatsApp Manager API', version: '1.0.0' }));
app.use('/api/health', healthRouter);
app.use('/api/sessions', sessionsRouter);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (error) => error ? next() : undefined);
});
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`[server] Evolution WhatsApp Manager listening on http://localhost:${config.port}`);
  console.log(`[server] Evolution API: ${config.evolutionUrl || '(not configured)'}`);
  console.log(`[server] API key: ${config.evolutionKey ? 'configured' : 'MISSING'}`);
});

const shutdown = (signal) => {
  console.log(`[server] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
