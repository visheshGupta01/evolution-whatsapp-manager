export type Session = {
  instanceName?: string;
  status?: string;
  state?: string;
  ownerJid?: string;
  profileName?: string;
  number?: string;
  tokenKnown?: boolean;
};

export type Chat = {
  id: string;
  remoteJid: string;
  name: string;
  unreadCount: number;
  archived: boolean;
  timestamp: string | number | null;
  lastMessage: string;
};

export type Message = {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  text: string;
  timestamp: number;
  status: string | null;
  messageType: string;
  pushName: string | null;
};

export type ApiResponse = {
  base64?: string;
  qrcode?: string;
  qr?: string;
  code?: string;
  message?: string;
};

function resolveApiBase() {
  const configured = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
  if (!configured) return `${window.location.origin}/api`;
  if (configured === '/api' || configured.endsWith('/api')) return configured;
  if (/^https?:\/\/[^/]+$/i.test(configured)) return `${configured}/api`;
  return configured;
}

const API = resolveApiBase();

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || `Request failed (${response.status})`);
  return body as T;
}

export const apiConfig = { baseUrl: API };

export const sessionsApi = {
  list: () => request<Session[]>('/sessions'),
  create: (instanceName: string) => request('/sessions', { method: 'POST', body: JSON.stringify({ instanceName }) }),
  connect: (instance: string) => request<ApiResponse>(`/sessions/${encodeURIComponent(instance)}/connect`),
  restart: (instance: string) => request(`/sessions/${encodeURIComponent(instance)}/restart`, { method: 'POST' }),
  disconnect: (instance: string) => request(`/sessions/${encodeURIComponent(instance)}/disconnect`, { method: 'POST' }),
  remove: (instance: string) => request(`/sessions/${encodeURIComponent(instance)}`, { method: 'DELETE' }),
  sendText: (instance: string, number: string, text: string) => request(`/sessions/${encodeURIComponent(instance)}/send-text`, {
    method: 'POST', body: JSON.stringify({ number, text }),
  }),
};

export const chatsApi = {
  list: (instance: string) => request<Chat[]>(`/chats/${encodeURIComponent(instance)}`),
  messages: (instance: string, remoteJid: string) => request<Message[]>(
    `/chats/${encodeURIComponent(instance)}/${encodeURIComponent(remoteJid)}/messages`,
  ),
  send: (instance: string, remoteJid: string, text: string) => request<Message>(
    `/chats/${encodeURIComponent(instance)}/${encodeURIComponent(remoteJid)}/messages`,
    { method: 'POST', body: JSON.stringify({ text }) },
  ),
};
