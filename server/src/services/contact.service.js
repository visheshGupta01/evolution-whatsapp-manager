import axios from 'axios';
import { config } from '../config.js';

const client = axios.create({
  baseURL: config.evolutionUrl,
  timeout: config.evolutionTimeoutMs,
  headers: { 'Content-Type': 'application/json' },
});

function messageFrom(error) {
  const data = error?.response?.data;
  if (Array.isArray(data?.response?.message)) return data.response.message.join(', ');
  if (Array.isArray(data?.message)) return data.message.join(', ');
  if (typeof data?.message === 'string') return data.message;
  return error?.message || 'Evolution API request failed';
}

async function request(url, data = {}) {
  try {
    const response = await client.post(url, data, { headers: { apikey: config.evolutionKey } });
    return response.data;
  } catch (error) {
    const wrapped = new Error(messageFrom(error));
    wrapped.status = error?.response?.status || 502;
    wrapped.details = error?.response?.data;
    throw wrapped;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.contacts)) return value.contacts;
  if (Array.isArray(value?.records)) return value.records;
  if (Array.isArray(value?.data?.records)) return value.data.records;
  return value ? [value] : [];
}

function normalizeContact(contact) {
  const remoteJid = contact?.remoteJid || contact?.id || contact?.jid || '';
  const number = String(contact?.number || remoteJid.split('@')[0] || '').replace(/:.*$/, '');
  return {
    id: String(contact?.id || remoteJid),
    remoteJid: String(remoteJid),
    remoteJidAlt: String(contact?.remoteJidAlt || contact?.jidAlt || contact?.phoneJid || ''),
    name: String(contact?.name || contact?.pushName || contact?.formattedName || number || 'Unknown'),
    pushName: String(contact?.pushName || ''),
    number,
    profilePicUrl: contact?.profilePicUrl || contact?.profilePictureUrl || null,
    isBusiness: Boolean(contact?.isBusiness),
    isGroup: Boolean(contact?.isGroup || String(remoteJid).endsWith('@g.us')),
    isSaved: Boolean(contact?.isSaved),
    status: contact?.status || null,
    raw: contact,
  };
}

export async function listContacts(instance) {
  const data = await request(`/chat/findContacts/${encodeURIComponent(instance)}`, {});
  return asArray(data).map(normalizeContact).filter((contact) => contact.remoteJid);
}
