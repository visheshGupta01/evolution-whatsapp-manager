import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data');
const STORE_FILE = path.join(DATA_DIR, 'campaigns.json');

let writeChain = Promise.resolve();

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(STORE_FILE); } catch { await fs.writeFile(STORE_FILE, '[]', 'utf8'); }
}

async function readAll() {
  await ensureStore();
  try {
    const parsed = JSON.parse(await fs.readFile(STORE_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function persist(items) {
  writeChain = writeChain.then(async () => {
    await ensureStore();
    const temp = `${STORE_FILE}.tmp`;
    await fs.writeFile(temp, JSON.stringify(items, null, 2), 'utf8');
    await fs.rename(temp, STORE_FILE);
  });
  return writeChain;
}

export async function listCampaigns({ limit = 50 } = {}) {
  const items = await readAll();
  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, Math.max(1, Math.min(Number(limit) || 50, 200)));
}

export async function getCampaign(id) {
  return (await readAll()).find((item) => item.id === id) || null;
}

export async function createCampaign(input) {
  const now = new Date().toISOString();
  const campaign = {
    id: cryptoRandomId(),
    name: String(input.name || 'Untitled campaign').trim() || 'Untitled campaign',
    type: input.type,
    instance: input.instance,
    status: 'queued',
    delayMs: input.delayMs,
    recipients: input.recipients,
    payload: input.payload,
    total: input.recipients.length,
    sent: 0,
    failed: 0,
    results: [],
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  };
  const items = await readAll();
  items.push(campaign);
  await persist(items);
  return campaign;
}

export async function updateCampaign(id, patch) {
  const items = await readAll();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const next = { ...items[index], ...patch, updatedAt: new Date().toISOString() };
  items[index] = next;
  await persist(items);
  return next;
}

function cryptoRandomId() {
  return `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
