export type Session = { instanceName?: string; status?: string; state?: string; ownerJid?: string; profileName?: string; number?: string; tokenKnown?: boolean };
export type ApiResponse = { base64?: string; qrcode?: string; qr?: string; code?: string; message?: string };
export type CampaignRecipient = { phone: string; name?: string; company?: string; custom1?: string; custom2?: string };
export type CampaignDeliveryStatus = { messageId: string; type: string; status: string; updatedAt: string };
export type CampaignRecipientResult = { index: number; phone: string; ok: boolean; message?: string; timestamp?: string; deliveryStatuses?: CampaignDeliveryStatus[] };
export type CampaignResult = { ok: boolean; total: number; sent: number; failed: number; results: CampaignRecipientResult[] };
export type CampaignMedia = { base64: string; mediatype: 'image' | 'video' | 'document'; mimetype: string; fileName: string };
export type CampaignButton = { type: 'reply' | 'copy' | 'url' | 'call'; id?: string; displayText: string; url?: string; copyCode?: string; phoneNumber?: string };
export type CampaignButtons = { title: string; description?: string; footer?: string; buttons: CampaignButton[] };
export type CampaignListRow = { title: string; description?: string; rowId: string };
export type CampaignListSection = { title: string; rows: CampaignListRow[] };
export type CampaignList = { title: string; description?: string; footerText?: string; buttonText: string; sections: CampaignListSection[] };
export type AudienceSummary = { id:string; name:string; description:string; total:number; createdAt:string; updatedAt:string };
export type Audience = AudienceSummary & { recipients: CampaignRecipient[] };
export type CampaignJobStatus = 'queued' | 'running' | 'paused' | 'cancelled' | 'completed' | 'failed';
export type CampaignAnalytics = {
  days: number;
  overview: {
    campaigns: number; completed: number; running: number; queued: number; paused: number; cancelled: number; failedCampaigns: number;
    totalRecipients: number; sent: number; failed: number; remaining: number; delivered: number; read: number; played: number;
    deliveryRate: number; readRate: number; failureRate: number;
  };
  daily: { date: string; sent: number; failed: number; delivered: number; read: number }[];
  campaigns: { id: string; name: string; type: string; status: string; total: number; sent: number; failed: number; messageCount: number; delivered: number; read: number; deliveryRate: number; readRate: number }[];
};
export type CampaignJob = CampaignResult & {
  id: string;
  name: string;
  type: 'text' | 'media' | 'media-text' | 'buttons' | 'list' | 'media-buttons' | 'media-list';
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
  configureWebhook: (instance: string, url?: string) => request(`/sessions/${encodeURIComponent(instance)}/webhook`, { method: 'POST', body: JSON.stringify({ url }) }),
  remove: (instance: string) => request(`/sessions/${encodeURIComponent(instance)}`, { method: 'DELETE' }),
};
export const audiencesApi = {
  list: () => request<AudienceSummary[]>('/audiences'),
  get: (id: string) => request<Audience>(`/audiences/${encodeURIComponent(id)}`),
  create: (name: string, description: string, recipients: CampaignRecipient[]) => request<Audience>('/audiences', { method:'POST', body:JSON.stringify({ name, description, recipients }) }),
  update: (id: string, name: string, description: string, recipients: CampaignRecipient[]) => request<Audience>(`/audiences/${encodeURIComponent(id)}`, { method:'PUT', body:JSON.stringify({ name, description, recipients }) }),
  remove: (id: string) => request<void>(`/audiences/${encodeURIComponent(id)}`, { method:'DELETE' }),
};

export const campaignJobsApi = {
  list: (limit = 50) => request<CampaignJob[]>(`/campaign-jobs?limit=${limit}`),
  analytics: (days = 30) => request<CampaignAnalytics>(`/campaign-jobs/analytics?days=${days}`),
  get: (id: string) => request<CampaignJob>(`/campaign-jobs/${encodeURIComponent(id)}`),
  pause: (id: string) => request<CampaignJob>(`/campaign-jobs/${encodeURIComponent(id)}/pause`, { method: 'POST' }),
  resume: (id: string) => request<CampaignJob>(`/campaign-jobs/${encodeURIComponent(id)}/resume`, { method: 'POST' }),
  cancel: (id: string) => request<CampaignJob>(`/campaign-jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  retryFailed: (id: string) => request<CampaignJob>(`/campaign-jobs/${encodeURIComponent(id)}/retry-failed`, { method: 'POST' }),
  create: (name: string, type: CampaignJob['type'], instance: string, recipients: CampaignRecipient[], payload: Record<string, unknown>, delayMs = 1500) =>
    request<CampaignJob>('/campaign-jobs', { method: 'POST', body: JSON.stringify({ name, type, instance, recipients, payload, delayMs }) }),
};

export type MessageTemplate = {
  id: string; name: string; type: 'text' | 'media-text' | 'buttons' | 'list' | 'media-buttons' | 'media-list';
  createdAt: string; updatedAt: string; text?: string; title?: string; description?: string; footer?: string;
  buttonText?: string; buttons?: CampaignButton[]; sections?: CampaignList['sections']; media?: CampaignMedia;
};
export const templatesApi = {
  list: () => request<MessageTemplate[]>('/templates'),
  create: (template: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
    const { name, type, ...data } = template; return request<MessageTemplate>('/templates', { method: 'POST', body: JSON.stringify({ name, type, data }) });
  },
  update: (id: string, template: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>) => {
    const { name, type, ...data } = template; return request<MessageTemplate>(`/templates/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ name, type, data }) });
  },
  remove: (id: string) => request<void>(`/templates/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'won' | 'lost';
export type LeadActivity = { id:string; at:string; text:string };
export type Lead = { id:string; name:string; phone:string; email:string; company:string; source:string; status:LeadStatus; tags:string[]; assignedTo:string|null; notes:string; createdAt:string; activity:LeadActivity[] };
export type WorkspaceMember = { id:string; name:string; email:string; jobTitle:string; status:'active'|'invited'|'suspended'; permissions:Record<string,boolean>; createdAt:string };
export type WorkspaceSettings = { workspaceName:string; ownerName:string; ownerEmail:string; whatsappNumber:string; timezone:string; notifyNewLead:boolean; notifyNewMessage:boolean };
export type AutomationNode = { id:string; type:'trigger'|'condition'|'tag'|'delay'|'message'|'assign'; label:string; config:Record<string,string> };
export type Automation = { id:string; name:string; status:'draft'|'active'|'paused'; nodes:AutomationNode[]; createdAt:string };
export type InboxChat = { instance:string; remoteJid:string; name?:string; unreadCount?:number; lastText?:string; [key:string]:unknown };
export type InboxMessage = { key?:{id?:string;remoteJid?:string;fromMe?:boolean}; message?:Record<string,any>; messageTimestamp?:number|string; pushName?:string; [key:string]:any };

export const crmApi = {
  listLeads:()=>request<Lead[]>('/crm/leads'),
  getLead:(id:string)=>request<Lead>(`/crm/leads/${encodeURIComponent(id)}`),
  createLead:(data:Omit<Lead,'id'|'createdAt'|'activity'>)=>request<Lead>('/crm/leads',{method:'POST',body:JSON.stringify(data)}),
  updateLead:(id:string,data:Partial<Lead>&{activityText?:string})=>request<Lead>(`/crm/leads/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(data)}),
  removeLead:(id:string)=>request<void>(`/crm/leads/${encodeURIComponent(id)}`,{method:'DELETE'}),
  stats:()=>request('/crm/stats')
};
export const workspaceApi = {
  members:()=>request<WorkspaceMember[]>('/workspace/members'),
  createMember:(data:Partial<WorkspaceMember>)=>request<WorkspaceMember>('/workspace/members',{method:'POST',body:JSON.stringify(data)}),
  updateMember:(id:string,data:Partial<WorkspaceMember>)=>request<WorkspaceMember>(`/workspace/members/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(data)}),
  removeMember:(id:string)=>request<void>(`/workspace/members/${encodeURIComponent(id)}`,{method:'DELETE'}),
  permissions:(id:string,permissions:Record<string,boolean>)=>request<Record<string,boolean>>(`/workspace/members/${encodeURIComponent(id)}/permissions`,{method:'PUT',body:JSON.stringify({permissions})}),
  settings:()=>request<WorkspaceSettings>('/workspace/settings'),
  updateSettings:(data:Partial<WorkspaceSettings>)=>request<WorkspaceSettings>('/workspace/settings',{method:'PUT',body:JSON.stringify(data)})
};
export const inboxApi = {
  chats:(instance:string)=>request<InboxChat[]>(`/inbox/chats/${encodeURIComponent(instance)}`),
  messages:(instance:string,remoteJid:string,page=1,offset=50)=>request<InboxMessage[]>(`/inbox/chats/${encodeURIComponent(instance)}/messages?remoteJid=${encodeURIComponent(remoteJid)}&page=${page}&offset=${offset}`),
  sendText:(instance:string,number:string,text:string)=>request(`/inbox/chats/${encodeURIComponent(instance)}/send-text`,{method:'POST',body:JSON.stringify({number,text})}),
  sendMedia:(instance:string,number:string,media:unknown,caption='')=>request(`/inbox/chats/${encodeURIComponent(instance)}/send-media`,{method:'POST',body:JSON.stringify({number,media,caption})}),
  markRead:(instance:string,readMessages:unknown[])=>request(`/inbox/chats/${encodeURIComponent(instance)}/read`,{method:'POST',body:JSON.stringify({readMessages})}),
  react:(instance:string,remoteJid:string,messageId:string,fromMe:boolean,reaction:string)=>request(`/inbox/chats/${encodeURIComponent(instance)}/reaction`,{method:'POST',body:JSON.stringify({remoteJid,messageId,fromMe,reaction})}),
  presence:(instance:string,number:string,presence='composing')=>request(`/inbox/chats/${encodeURIComponent(instance)}/presence`,{method:'POST',body:JSON.stringify({number,presence,delay:1000})}),
  archive:(instance:string,chat:string,archive:boolean)=>request(`/inbox/chats/${encodeURIComponent(instance)}/archive`,{method:'POST',body:JSON.stringify({chat,archive})}),
  deleteMessage:(instance:string,messageId:string,remoteJid:string,fromMe=true)=>request(`/inbox/chats/${encodeURIComponent(instance)}/messages/${encodeURIComponent(messageId)}`,{method:'DELETE',body:JSON.stringify({remoteJid,fromMe})}),
  updateMessage:(instance:string,messageId:string,payload:unknown)=>request(`/inbox/chats/${encodeURIComponent(instance)}/messages/${encodeURIComponent(messageId)}`,{method:'PATCH',body:JSON.stringify(payload)})
};
export const automationApi = {
  list:()=>request<Automation[]>('/automations'),
  create:(name:string)=>request<Automation>('/automations',{method:'POST',body:JSON.stringify({name})}),
  update:(id:string,data:Partial<Automation>)=>request<Automation>(`/automations/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(data)}),
  remove:(id:string)=>request<void>(`/automations/${encodeURIComponent(id)}`,{method:'DELETE'})
};

export const campaignsApi = {
  sendText: (instance: string, text: string, recipients: CampaignRecipient[], delayMs = 1500) => request<CampaignResult>('/campaigns/text', { method: 'POST', body: JSON.stringify({ instance, text, recipients, delayMs }) }),
  sendMedia: (instance: string, media: CampaignMedia, caption: string, recipients: CampaignRecipient[], delayMs = 1500) => request<CampaignResult>('/campaigns/media', { method: 'POST', body: JSON.stringify({ instance, media, caption, recipients, delayMs }) }),
  sendButtons: (instance: string, payload: CampaignButtons, recipients: CampaignRecipient[], delayMs = 1500) => request<CampaignResult>('/campaigns/buttons', { method: 'POST', body: JSON.stringify({ instance, payload, recipients, delayMs }) }),
  sendList: (instance: string, payload: CampaignList, recipients: CampaignRecipient[], delayMs = 1500) => request<CampaignResult>('/campaigns/list', { method: 'POST', body: JSON.stringify({ instance, payload, recipients, delayMs }) }),
};
