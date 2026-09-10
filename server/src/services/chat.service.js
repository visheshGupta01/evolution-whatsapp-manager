import { sendText } from './evolution.service.js';
import { config } from '../config.js';
import axios from 'axios';

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

async function request(method, url, data) {
  try {
    const response = await client.request({
      method,
      url,
      data,
      headers: { apikey: config.evolutionKey },
    });
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
  if (Array.isArray(value?.chats)) return value.chats;
  if (Array.isArray(value?.messages)) return value.messages;
  return value ? [value] : [];
}

function textFromMessage(message) {
  const m = message?.message || message;
  return m?.conversation
    || m?.extendedTextMessage?.text
    || m?.imageMessage?.caption
    || m?.videoMessage?.caption
    || m?.documentMessage?.caption
    || m?.buttonsResponseMessage?.selectedDisplayText
    || m?.listResponseMessage?.title
    || m?.templateButtonReplyMessage?.selectedDisplayText
    || m?.reactionMessage?.text
    || '';
}

export function normalizeChat(chat) {
  const remoteJid = chat?.remoteJid || chat?.id || chat?.jid || chat?.key?.remoteJid || '';
  const name = chat?.name || chat?.pushName || chat?.formattedName || chat?.subject || remoteJid.split('@')[0] || 'Unknown';
  const last = chat?.lastMessage || chat?.lastMessageMessage || chat?.message || {};
  return {
    id: String(chat?.id || remoteJid),
    remoteJid: String(remoteJid),
    name: String(name),
    unreadCount: Number(chat?.unreadCount || chat?.unread || 0),
    archived: Boolean(chat?.archived),
    timestamp: chat?.conversationTimestamp || chat?.timestamp || chat?.updatedAt || null,
    lastMessage: textFromMessage(last),
    raw: chat,
  };
}

export function normalizeMessage(message) {
  const key = message?.key || {};
  return {
    id: String(key?.id || message?.id || `${key?.remoteJid || ''}-${message?.messageTimestamp || Date.now()}`),
    remoteJid: String(key?.remoteJid || message?.remoteJid || ''),
    fromMe: Boolean(key?.fromMe || message?.fromMe),
    text: textFromMessage(message),
    timestamp: Number(message?.messageTimestamp || message?.timestamp || 0),
    status: message?.status || null,
    messageType: message?.messageType || Object.keys(message?.message || {})[0] || 'unknown',
    pushName: message?.pushName || null,
    raw: message,
  };
}

export async function listChats(instance) {
  const data = await request('POST', `/chat/findChats/${encodeURIComponent(instance)}`, {});
  return asArray(data).map(normalizeChat).filter((chat) => chat.remoteJid);
}

export async function listMessages(instance, remoteJid) {
  const data = await request('POST', `/chat/findMessages/${encodeURIComponent(instance)}`, {
    where: { key: { remoteJid } },
  });
  return asArray(data)
    .map(normalizeMessage)
    .filter((message) => message.remoteJid)
    .sort((a, b) => a.timestamp - b.timestamp);
}

export { sendText };
