export type Session = { instanceName?: string; status?: string; state?: string; ownerJid?: string; profileName?: string; number?: string; tokenKnown?: boolean };
export type ApiResponse = { base64?: string; qrcode?: string; qr?: string; code?: string; message?: string };
export type CampaignRecipient = { phone: string; name?: string; company?: string; custom1?: string; custom2?: string };
export type CampaignResult = { ok: boolean; total: number; sent: number; failed: number; results: Array<{ index: number; phone: string; ok: boolean; message?: string }> };
export type CampaignMedia = { base64: string; mediatype: 'image' | 'video' | 'document'; mimetype: string; fileName: string };
export type CampaignButton = { type: 'reply' | 'copy' | 'url' | 'call'; id?: string; displayText: string; url?: string; copyCode?: string; phoneNumber?: string };
export type CampaignButtons = { title: string; description?: string; footer?: string; buttons: CampaignButton[] };
export type CampaignListRow = { title: string; description?: string; rowId: string };
export type CampaignListSection = { title: string; rows: CampaignListRow[] };
export type CampaignList = { title: string; description?: string; footerText?: string; buttonText: string; sections: CampaignListSection[] };
export type CampaignJobStatus = 'queued' | 'running' | 'completed' | 'failed';
export type CampaignJob = CampaignResult & {
  id: string;
  name: string;
  type: 'text' | 'media' | 'media-text' | 'buttons' | 'list';
  instance: string;
  status: CampaignJobStatus;
  delayMs: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string;
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
  const response = await fetch(`${API}${path}`, { ...init, headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } });
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
};
export const campaignJobsApi = {
  list: (limit = 50) => request<CampaignJob[]>(`/campaign-jobs?limit=${limit}`),
  get: (id: string) => request<CampaignJob>(`/campaign-jobs/${encodeURIComponent(id)}`),
  create: (name: string, type: CampaignJob['type'], instance: string, recipients: CampaignRecipient[], payload: Record<string, unknown>, delayMs = 1500) =>
    request<CampaignJob>('/campaign-jobs', { method: 'POST', body: JSON.stringify({ name, type, instance, recipients, payload, delayMs }) }),
};

export const campaignsApi = {
  sendText: (instance: string, text: string, recipients: CampaignRecipient[], delayMs = 1500) => request<CampaignResult>('/campaigns/text', { method: 'POST', body: JSON.stringify({ instance, text, recipients, delayMs }) }),
  sendMedia: (instance: string, media: CampaignMedia, caption: string, recipients: CampaignRecipient[], delayMs = 1500) => request<CampaignResult>('/campaigns/media', { method: 'POST', body: JSON.stringify({ instance, media, caption, recipients, delayMs }) }),
  sendButtons: (instance: string, payload: CampaignButtons, recipients: CampaignRecipient[], delayMs = 1500) => request<CampaignResult>('/campaigns/buttons', { method: 'POST', body: JSON.stringify({ instance, payload, recipients, delayMs }) }),
  sendList: (instance: string, payload: CampaignList, recipients: CampaignRecipient[], delayMs = 1500) => request<CampaignResult>('/campaigns/list', { method: 'POST', body: JSON.stringify({ instance, payload, recipients, delayMs }) }),
};
