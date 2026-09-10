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
  const messages = data?.response?.message ?? data?.message;
  if (Array.isArray(messages)) {
    return messages.flat(Infinity).map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.message || JSON.stringify(item);
      return String(item);
    }).join(', ');
  }
  if (typeof messages === 'string') return messages;
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
  if (Array.isArray(value?.data?.records)) return value.data.records;
  if (Array.isArray(value?.chats)) return value.chats;
  if (Array.isArray(value?.messages)) return value.messages;
  if (Array.isArray(value?.messages?.records)) return value.messages.records;
  if (Array.isArray(value?.response?.messages)) return value.response.messages;
  if (Array.isArray(value?.response?.messages?.records)) return value.response.messages.records;
  if (Array.isArray(value?.response?.records)) return value.response.records;
  if (Array.isArray(value?.records)) return value.records;
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

function chatAlternateJid(chat) {
  return chat?.remoteJidAlt
    || chat?.key?.remoteJidAlt
    || chat?.jidAlt
    || chat?.altJid
    || chat?.phoneJid
    || chat?.numberJid
    || chat?.contact?.remoteJidAlt
    || chat?.contact?.jid
    || '';
}

export function normalizeChat(chat) {
  const remoteJid = chat?.remoteJid || chat?.id || chat?.jid || chat?.key?.remoteJid || '';
  const remoteJidAlt = chatAlternateJid(chat);
  const name = chat?.name || chat?.pushName || chat?.formattedName || chat?.subject || remoteJid.split('@')[0] || 'Unknown';
  const last = chat?.lastMessage || chat?.lastMessageMessage || chat?.message || {};
  return {
    id: String(chat?.id || remoteJid),
    remoteJid: String(remoteJid),
    remoteJidAlt: String(remoteJidAlt),
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
  const remoteJid = key?.remoteJid || message?.remoteJid || '';
  const remoteJidAlt = key?.remoteJidAlt || message?.remoteJidAlt || '';
  return {
    id: String(key?.id || message?.id || `${remoteJid}-${message?.messageTimestamp || Date.now()}`),
    remoteJid: String(remoteJid),
    remoteJidAlt: String(remoteJidAlt),
    fromMe: Boolean(key?.fromMe || message?.fromMe),
    text: textFromMessage(message),
    timestamp: Number(message?.messageTimestamp || message?.timestamp || 0),
    status: message?.status || null,
    messageType: message?.messageType || Object.keys(message?.message || {})[0] || 'unknown',
    pushName: message?.pushName || null,
    raw: message,
  };
}

function jidVariants(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return [];
  const withoutDevice = raw.replace(/:\d+(?=@)/, '');
  const number = withoutDevice.split('@')[0].replace(/\D/g, '');
  const variants = new Set([raw, withoutDevice]);
  if (number) variants.add(number);
  return [...variants];
}

function messagesMatchTargets(message, targets) {
  const targetVariants = targets.flatMap(jidVariants);
  const messageVariants = [
    ...jidVariants(message?.remoteJid),
    ...jidVariants(message?.remoteJidAlt),
    ...jidVariants(message?.key?.remoteJid),
    ...jidVariants(message?.key?.remoteJidAlt),
  ];
  return targetVariants.some((target) => messageVariants.includes(target));
}

function filterMessages(messages, targets) {
  return messages
    .map(normalizeMessage)
    .filter((message) => messagesMatchTargets(message, targets))
    .sort((a, b) => a.timestamp - b.timestamp);
}

async function findChatJids(instance, remoteJid) {
  const data = await request('POST', `/chat/findChats/${encodeURIComponent(instance)}`, {});
  const chats = asArray(data);
  const target = jidVariants(remoteJid);
  const chat = chats.find((item) => {
    const candidates = [
      item?.remoteJid,
      item?.remoteJidAlt,
      item?.id,
      item?.jid,
      item?.key?.remoteJid,
      item?.key?.remoteJidAlt,
    ];
    return candidates.some((candidate) => jidVariants(candidate).some((value) => target.includes(value)));
  });
  if (!chat) return [];
  return [...new Set([
    remoteJid,
    chat?.remoteJid,
    chatAlternateJid(chat),
    chat?.key?.remoteJid,
    chat?.key?.remoteJidAlt,
  ].filter(Boolean))];
}

export async function listChats(instance) {
  const data = await request('POST', `/chat/findChats/${encodeURIComponent(instance)}`, {});
  return asArray(data).map(normalizeChat).filter((chat) => chat.remoteJid);
}

export async function listMessages(instance, remoteJid) {
  const encodedInstance = encodeURIComponent(instance);
  const target = String(remoteJid).trim();
  const targets = [target];

  if (target.toLowerCase().endsWith('@lid')) {
    targets.push(...await findChatJids(instance, target));
  }

  const uniqueTargets = [...new Set(targets.filter(Boolean))];

  for (const candidate of uniqueTargets) {
    const filteredData = await request('POST', `/chat/findMessages/${encodedInstance}`, {
      where: { key: { remoteJid: candidate } },
    });
    const filteredRaw = asArray(filteredData);
    if (filteredRaw.length) {
      return filteredRaw.map(normalizeMessage).sort((a, b) => a.timestamp - b.timestamp);
    }
  }

  const allData = await request('POST', `/chat/findMessages/${encodedInstance}`, {});
  return filterMessages(asArray(allData), uniqueTargets);
}

export async function resolveMessageNumber(instance, remoteJid) {
  const target = String(remoteJid || '').trim();
  const targets = target.toLowerCase().endsWith('@lid')
    ? await findChatJids(instance, target)
    : [target];

  const phoneJid = targets.find((jid) => jid.toLowerCase().endsWith('@s.whatsapp.net'));
  if (phoneJid) return phoneJid.replace(/@s\.whatsapp\.net$/i, '').replace(/\D/g, '');

  const groupJid = targets.find((jid) => jid.toLowerCase().endsWith('@g.us'));
  if (groupJid) return groupJid;

  const numericTarget = targets.find((jid) => /^\d{7,20}$/.test(String(jid).replace(/\D/g, '')));
  if (numericTarget) return String(numericTarget).replace(/\D/g, '');

  throw Object.assign(new Error('Could not resolve this WhatsApp chat to a sendable phone number. Refresh the conversations and try again.'), { status: 400 });
}

export { sendText };
