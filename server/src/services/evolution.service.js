import crypto from 'node:crypto';
import axios from 'axios';
import { config } from '../config.js';

const client = axios.create({
  baseURL: config.evolutionUrl,
  timeout: config.evolutionTimeoutMs,
  headers: { 'Content-Type': 'application/json' },
});

const tokens = new Map();

export class EvolutionError extends Error {
  constructor(message, status = 502, details = undefined) {
    super(message);
    this.name = 'EvolutionError';
    this.status = status;
    this.details = details;
  }
}

function formatErrorValue(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.flat(Infinity).map(formatErrorValue).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    if (typeof value.message === 'string') return value.message;
    if (typeof value.error === 'string') return value.error;
    try { return JSON.stringify(value); } catch { return '[object]'; }
  }
  return value == null ? '' : String(value);
}

function messageFrom(error) {
  const data = error?.response?.data;
  const value = data?.response?.message ?? data?.message ?? data?.error;
  const formatted = formatErrorValue(value);
  if (formatted) return formatted;
  if (typeof data === 'string') return data;
  if (error?.code === 'ECONNABORTED') return 'Evolution API request timed out';
  if (error?.code === 'ECONNREFUSED') return 'Evolution API is unreachable';
  return error?.message || 'Evolution API request failed';
}

async function request(options) {
  try {
    return await client.request({ ...options, headers: { apikey: config.evolutionKey, ...(options.headers || {}) } });
  } catch (error) {
    throw new EvolutionError(messageFrom(error), error?.response?.status || 502, error?.response?.data);
  }
}

function extractState(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  return value.state || value.status || value.connectionStatus || value.connection?.state;
}

function normalize(item, connectionState) {
  const instance = item?.instance || item || {};
  const connection = instance.connectionStatus ?? item?.connectionStatus ?? item?.connection ?? instance.connection;
  const liveConnection = connectionState?.instance ?? connectionState;
  const instanceName = instance.instanceName || item?.instanceName || item?.name || liveConnection?.instanceName;
  const state = extractState(liveConnection) || extractState(connection) || extractState(instance.state) || extractState(item?.state) || extractState(instance.status) || extractState(item?.status);
  const owner = instance.ownerJid || instance.owner || item?.ownerJid || item?.owner || liveConnection?.ownerJid || liveConnection?.owner;
  return {
    instanceName,
    status: state,
    state,
    ownerJid: owner,
    profileName: instance.profileName || item?.profileName || liveConnection?.profileName,
    number: instance.number || item?.number || instance.phoneNumber || item?.phoneNumber || owner?.split?.('@')[0],
    tokenKnown: Boolean(instanceName && tokens.has(instanceName)),
  };
}

export async function health() {
  if (!config.evolutionUrl || !config.evolutionKey) return { ok: false, message: 'Evolution API is not configured' };
  await request({ method: 'GET', url: '/' });
  return { ok: true, evolutionApi: config.evolutionUrl };
}

export async function listInstances() {
  const { data } = await request({ method: 'GET', url: '/instance/fetchInstances' });
  const items = Array.isArray(data) ? data : Array.isArray(data?.instances) ? data.instances : data ? [data] : [];
  return Promise.all(items.map(async (item) => {
    const instance = item?.instance || item || {};
    const name = instance.instanceName || item?.instanceName || item?.name;
    if (!name) return null;
    try {
      const { data: state } = await request({ method: 'GET', url: `/instance/connectionState/${encodeURIComponent(name)}` });
      return normalize(item, state);
    } catch {
      return normalize(item);
    }
  })).then((instances) => instances.filter((item) => item?.instanceName));
}

export async function createInstance(instanceName) {
  const token = crypto.randomBytes(24).toString('hex');
  const { data } = await request({
    method: 'POST',
    url: '/instance/create',
    data: { instanceName, integration: 'WHATSAPP-BAILEYS', token, qrcode: true },
  });
  tokens.set(instanceName, token);
  return { instanceName, tokenKnown: true, ...data };
}

export const connectInstance = (instance) => request({ method: 'GET', url: `/instance/connect/${encodeURIComponent(instance)}` }).then((r) => r.data);
export const restartInstance = (instance) => request({ method: 'PUT', url: `/instance/restart/${encodeURIComponent(instance)}` }).then((r) => r.data);

export async function sendText(instance, number, text, options = {}) {
  const cleanNumber = String(number || '').replace(/[^0-9@.\-a-zA-Z]/g, '');
  const message = String(text || '').trim();
  if (!cleanNumber) throw new EvolutionError('Recipient number is required', 400);
  if (!message) throw new EvolutionError('Message text is required', 400);

  // Evolution API v2 expects the text field at the top level for sendText.
  const { data } = await request({
    method: 'POST',
    url: `/message/sendText/${encodeURIComponent(instance)}`,
    data: {
      number: cleanNumber,
      text: message,
      delay: Math.max(0, Number(options.delayMs || 0)),
      linkPreview: Boolean(options.linkPreview),
    },
  });
  return data;
}

export async function sendMedia(instance, number, media, options = {}) {
  const cleanNumber = String(number || '').replace(/[^0-9@.\-a-zA-Z]/g, '');
  const base64 = String(media?.base64 || '').replace(/^data:[^;]+;base64,/, '').trim();
  const mediatype = String(media?.mediatype || '').trim().toLowerCase();
  const mimetype = String(media?.mimetype || '').trim();
  const fileName = String(media?.fileName || 'media').trim();
  const caption = String(options.caption || '').trim();

  if (!cleanNumber) throw new EvolutionError('Recipient number is required', 400);
  if (!base64) throw new EvolutionError('Media data is required', 400);
  if (!['image', 'video', 'document'].includes(mediatype)) throw new EvolutionError('Media type must be image, video or document', 400);
  if (!mimetype) throw new EvolutionError('Media MIME type is required', 400);

  const { data } = await request({
    method: 'POST',
    url: `/message/sendMedia/${encodeURIComponent(instance)}`,
    data: {
      number: cleanNumber,
      mediatype,
      mimetype,
      media: base64,
      fileName,
      caption,
      delay: Math.max(0, Number(options.delayMs || 0)),
    },
  });
  return data;
}

export async function deleteInstance(instance) {
  const { data } = await request({ method: 'DELETE', url: `/instance/delete/${encodeURIComponent(instance)}` });
  tokens.delete(instance);
  return data;
}

export async function logoutInstance(instance) {
  try {
    return (await request({ method: 'DELETE', url: `/instance/logout/${encodeURIComponent(instance)}` })).data;
  } catch (error) {
    if (![404, 405].includes(error.status)) throw error;
    return (await request({ method: 'POST', url: `/instance/disconnect/${encodeURIComponent(instance)}` })).data;
  }
}
