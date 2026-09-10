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

function messageFrom(error) {
  const data = error?.response?.data;
  if (Array.isArray(data?.response?.message)) return data.response.message.join(', ');
  if (Array.isArray(data?.message)) return data.message.join(', ');
  if (typeof data?.message === 'string') return data.message;
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

function normalize(item) {
  const instance = item?.instance || item || {};
  const instanceName = instance.instanceName || item?.instanceName || item?.name;
  return {
    instanceName,
    status: instance.status || item?.status,
    state: instance.connectionStatus?.state || item?.connectionStatus?.state || instance.state || item?.state,
    ownerJid: instance.owner || item?.owner,
    profileName: instance.profileName || item?.profileName,
    number: instance.number || item?.number,
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
  return items.map(normalize).filter((item) => item.instanceName);
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
export const deleteInstance = async (instance) => { const { data } = await request({ method: 'DELETE', url: `/instance/delete/${encodeURIComponent(instance)}` }); tokens.delete(instance); return data; };

export async function logoutInstance(instance) {
  try {
    return (await request({ method: 'DELETE', url: `/instance/logout/${encodeURIComponent(instance)}` })).data;
  } catch (error) {
    if (![404, 405].includes(error.status)) throw error;
    return (await request({ method: 'POST', url: `/instance/disconnect/${encodeURIComponent(instance)}` })).data;
  }
}

export const sendText = (instance, number, text) => request({ method: 'POST', url: `/message/sendText/${encodeURIComponent(instance)}`, data: { number, text } }).then((r) => r.data);
