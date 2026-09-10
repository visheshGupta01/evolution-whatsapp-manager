import crypto from 'node:crypto';

const clients = new Set();

export function addClient(res) {
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

export function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function normalizeEvolutionEvent(payload) {
  const data = payload?.data ?? payload;
  const rawEvent = String(payload?.event ?? payload?.type ?? payload?.eventType ?? 'unknown').toLowerCase();
  const instance = payload?.instance ?? payload?.instanceName ?? data?.instance ?? data?.instanceName ?? null;
  const event = rawEvent.replace(/_/g, '.');

  return {
    id: crypto.randomUUID(),
    source: 'evolution',
    event,
    instance: instance ? String(instance) : null,
    timestamp: new Date().toISOString(),
    data,
  };
}

export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!secret) return true;
  if (!signature || !rawBody) return false;

  const provided = String(signature).replace(/^sha256=/, '').trim();
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  if (provided.length !== expected.length) return false;

  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export function clientCount() {
  return clients.size;
}
