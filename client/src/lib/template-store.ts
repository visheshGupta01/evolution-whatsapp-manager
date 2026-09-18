export type TemplateType = 'text' | 'media-text' | 'buttons' | 'list' | 'media-buttons' | 'media-list';

export type TemplateButton = {
  type: 'reply';
  id: string;
  displayText: string;
};

export type TemplateListRow = {
  title: string;
  description?: string;
  rowId: string;
};

export type TemplateListSection = {
  title: string;
  rows: TemplateListRow[];
};

export type MessageTemplate = {
  id: string;
  name: string;
  type: TemplateType;
  createdAt: string;
  updatedAt: string;
  text?: string;
  title?: string;
  description?: string;
  footer?: string;
  buttonText?: string;
  buttons?: TemplateButton[];
  sections?: TemplateListSection[];
};

const STORAGE_KEY = 'evolution-manager-message-templates';
const HANDOFF_KEY = 'evolution-manager-template-handoff';

export function loadTemplates(): MessageTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates: MessageTemplate[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function createTemplate(template: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  const next: MessageTemplate = { ...template, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  saveTemplates([next, ...loadTemplates()]);
  return next;
}

export function updateTemplate(id: string, patch: Partial<Omit<MessageTemplate, 'id' | 'createdAt'>>) {
  const now = new Date().toISOString();
  saveTemplates(loadTemplates().map((template) => template.id === id ? { ...template, ...patch, updatedAt: now } : template));
}

export function deleteTemplate(id: string) {
  saveTemplates(loadTemplates().filter((template) => template.id !== id));
}

export function setTemplateHandoff(template: MessageTemplate) {
  localStorage.setItem(HANDOFF_KEY, JSON.stringify(template));
}

export function consumeTemplateHandoff(): MessageTemplate | null {
  try {
    const raw = localStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    localStorage.removeItem(HANDOFF_KEY);
    return JSON.parse(raw) as MessageTemplate;
  } catch {
    localStorage.removeItem(HANDOFF_KEY);
    return null;
  }
}

export function templateTypeLabel(type: TemplateType) {
  return ({ text: 'Text', 'media-text': 'Media + Text', buttons: 'Buttons', list: 'List', 'media-buttons': 'Media + Buttons', 'media-list': 'Media + List' })[type];
}
