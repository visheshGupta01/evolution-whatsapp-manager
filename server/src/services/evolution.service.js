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
    return await client.request({
      ...options,
      headers: { apikey: config.evolutionKey, ...(options.headers || {}) },
    });
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
  const state = extractState(liveConnection)
    || extractState(connection)
    || extractState(instance.state)
    || extractState(item?.state)
    || extractState(instance.status)
    || extractState(item?.status);

  const owner = instance.ownerJid || instance.owner || item?.ownerJid || item?.owner
    || liveConnection?.ownerJid || liveConnection?.owner;

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

    // fetchInstances on Evolution v2 may return connectionStatus as a STRING
    // (`open`, `connecting`, `close`). The previous normalizer treated that
    // string like an object and therefore silently converted a connected
    // instance into `unknown`. Prefer the dedicated live endpoint when it is
    // available, but always keep the fetchInstances state as a fallback.
    try {
      const { data: state } = await request({
        method: 'GET',
        url: `/instance/connectionState/${encodeURIComponent(name)}`,
      });
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
    data: {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      token,
      qrcode: true,
      webhook: {
        url: config.webhookUrl,
        byEvents: false,
        base64: false,
        events: [
          'APPLICATION_STARTUP',
          'QRCODE_UPDATED',
          'CONNECTION_UPDATE',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'SEND_MESSAGE',
          'CONTACTS_UPDATE',
          'CHATS_UPDATE',
          'CHATS_DELETE',
          'GROUPS_UPSERT',
          'GROUP_UPDATE',
          'GROUP_PARTICIPANTS_UPDATE',
          'PRESENCE_UPDATE',
        ],
      },
    },
  });
  tokens.set(instanceName, token);
  return { instanceName, tokenKnown: true, ...data };
}

export const connectInstance = (instance) => request({ method: 'GET', url: `/instance/connect/${encodeURIComponent(instance)}` }).then((r) => r.data);
export const restartInstance = (instance) => request({ method: 'PUT', url: `/instance/restart/${encodeURIComponent(instance)}` }).then((r) => r.data);
export const deleteInstance = async (instance) => {
  const { data } = await request({ method: 'DELETE', url: `/instance/delete/${encodeURIComponent(instance)}` });
  tokens.delete(instance);
  return data;
};

export async function logoutInstance(instance) {
  try {
    return (await request({ method: 'DELETE', url: `/instance/logout/${encodeURIComponent(instance)}` })).data;
  } catch (error) {
    if (![404, 405].includes(error.status)) throw error;
    return (await request({ method: 'POST', url: `/instance/disconnect/${encodeURIComponent(instance)}` })).data;
  }
}

export const sendText = (instance, number, text) => request({
  method: 'POST',
  url: `/message/sendText/${encodeURIComponent(instance)}`,
  data: { number, text },
}).then((r) => r.data);
