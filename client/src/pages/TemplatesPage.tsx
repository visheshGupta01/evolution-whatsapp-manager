import { useEffect, useMemo, useState } from 'react';
import { Copy, FileText, List, MessageSquare, Pencil, Plus, Smartphone, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { templatesApi, type MessageTemplate } from '../lib/api';
import { setTemplateHandoff } from '../lib/template-store';
import type { TemplateButton, TemplateListSection, TemplateType } from '../lib/template-store';
import '../styles/templates.css';

const typeOptions: Array<{ id: TemplateType; label: string; description: string }> = [
  { id: 'text', label: 'Text', description: 'Reusable WhatsApp text' },
  { id: 'media-text', label: 'Media + Text', description: 'Reusable caption with media' },
  { id: 'buttons', label: 'Buttons', description: 'Reusable reply buttons' },
  { id: 'list', label: 'List', description: 'Reusable list menu' },
  { id: 'media-buttons', label: 'Media + Buttons', description: 'Media with reply buttons' },
  { id: 'media-list', label: 'Media + List', description: 'Media with an interactive list' },
];

const defaultButtons = (): TemplateButton[] => [
  { type: 'reply', id: 'option_1', displayText: 'Option 1' },
  { type: 'reply', id: 'option_2', displayText: 'Option 2' },
];

const defaultSections = (): TemplateListSection[] => [{
  title: 'Options',
  rows: [
    { rowId: 'option_1', title: 'Option 1', description: 'First option' },
    { rowId: 'option_2', title: 'Option 2', description: 'Second option' },
  ],
}];

function TemplateIcon({ type }: { type: TemplateType }) {
  if (type === 'buttons') return <Smartphone size={18} />;
  if (type === 'list') return <List size={18} />;
  if (type === 'media-text' || type === 'media-buttons' || type === 'media-list') return <FileText size={18} />;
  return <MessageSquare size={18} />;
}

export function TemplatesPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = async () => { try { setTemplates(await templatesApi.list()); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not load templates.'); } finally { setLoading(false); } };
  useEffect(() => { void refresh(); }, []);
  const startCreate = () => {
    setEditing(null);
    setCreateOpen(true);
  };
  const startEdit = (template: MessageTemplate) => {
    setEditing(template);
    setCreateOpen(true);
  };
  const remove = (template: MessageTemplate) => {
    if (!window.confirm(`Delete template “${template.name}”?`)) return;
    void templatesApi.remove(template.id).then(() => { void refresh(); }).catch((error) => toast.error(error instanceof Error ? error.message : 'Could not delete template.'));
    toast.success('Template deleted');
  };
  const useTemplate = (template: MessageTemplate) => {
    setTemplateHandoff(template);
    navigate('/send');
  };

  const counts = useMemo(() => ({ total: templates.length, text: templates.filter((item) => item.type === 'text').length, interactive: templates.filter((item) => item.type === 'buttons' || item.type === 'list').length }), [templates]);

  return <div className="templatesPage">
    <section className="hero templatesHero">
      <div>
        <p className="eyebrow">CAMPAIGNS</p>
        <h1>Message Templates</h1>
        <p>Create reusable messages once and load them directly into the Send Message campaign builder.</p>
      </div>
      <button type="button" className="primary" onClick={startCreate}><Plus size={16} /> New template</button>
    </section>

    <div className="templateStats">
      <div><strong>{counts.total}</strong><span>Total templates</span></div>
      <div><strong>{counts.text}</strong><span>Text</span></div>
      <div><strong>{counts.interactive}</strong><span>Interactive</span></div>
    </div>

    {!templates.length ? <section className="templateEmpty">
      <div className="templateEmptyIcon"><MessageSquare size={24} /></div>
      <h2>No templates yet</h2>
      <p>Save your frequently used text, button and list campaigns here. Personalization variables such as <code>{'{{name}}'}</code> can be reused.</p>
      <button type="button" className="primary" onClick={startCreate}><Plus size={15} /> Create your first template</button>
    </section> : <section className="templateGrid">
      {templates.map((template) => <article className="templateCard" key={template.id}>
        <div className="templateCardTop">
          <div className="templateTypeIcon"><TemplateIcon type={template.type} /></div>
          <div className="templateCardMeta"><span>{({ text: 'Text', 'media-text': 'Media + Text', buttons: 'Buttons', list: 'List', 'media-buttons': 'Media + Buttons', 'media-list': 'Media + List' } as Record<string,string>)[template.type]}</span><strong>{template.name}</strong></div>
          <div className="templateCardActions">
            <button type="button" title="Edit" onClick={() => startEdit(template)}><Pencil size={14} /></button>
            <button type="button" title="Delete" onClick={() => remove(template)}><Trash2 size={14} /></button>
          </div>
        </div>
        <div className="templateCardPreview">
          {template.type === 'text' || template.type === 'media-text' ? <p>{template.text || 'No message content'}</p> : template.type === 'buttons' ? <><strong>{template.title}</strong><p>{template.description}</p><div className="templateButtonsPreview">{template.buttons?.map((button) => <span key={button.id}>{button.displayText}</span>)}</div></> : <><strong>{template.title}</strong><p>{template.description}</p><div className="templateListPreview">{template.sections?.flatMap((section) => section.rows).slice(0, 3).map((row) => <span key={row.rowId}>{row.title}</span>)}</div></>}
        </div>
        <button type="button" className="templateUse" onClick={() => useTemplate(template)}><Copy size={14} /> Use in Send Message</button>
      </article>)}
    </section>}

    {createOpen && <TemplateEditor template={editing} close={() => setCreateOpen(false)} saved={() => { setCreateOpen(false); refresh(); }} />}
  </div>;
}

function TemplateEditor({ template, close, saved }: { template: MessageTemplate | null; close: () => void; saved: () => void }) {
  const [name, setName] = useState(template?.name || '');
  const [type, setType] = useState<TemplateType>(template?.type || 'text');
  const [text, setText] = useState(template?.text || 'Hi {{name}},\n\nYour message goes here.');
  const [title, setTitle] = useState(template?.title || 'Choose an option');
  const [description, setDescription] = useState(template?.description || 'Hi {{name}}, please choose one of the options below.');
  const [footer, setFooter] = useState(template?.footer || 'Reply with your choice');
  const [buttonText, setButtonText] = useState(template?.buttonText || 'View options');
  const [buttons, setButtons] = useState<TemplateButton[]>(template?.buttons || defaultButtons());
  const [sections, setSections] = useState<TemplateListSection[]>(template?.sections || defaultSections());

  const save = async () => {
    if (!name.trim()) return toast.error('Enter a template name.');
    if ((type === 'text' || type === 'media-text') && !text.trim()) return toast.error('Enter message content.');
    if (['buttons', 'media-buttons'].includes(type) && (!title.trim() || !buttons.length || buttons.some((button) => !button.id.trim() || !button.displayText.trim()))) return toast.error('Complete the button template.');
    if (['list', 'media-list'].includes(type) && (!title.trim() || !buttonText.trim() || !sections.length || sections.some((section) => !section.title.trim() || !section.rows.length || section.rows.some((row) => !row.rowId.trim() || !row.title.trim())))) return toast.error('Complete the list template.');

    const data: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'> = type === 'text' || type === 'media-text'
      ? { name: name.trim(), type, text: text.trim() }
      : ['buttons', 'media-buttons'].includes(type)
        ? { name: name.trim(), type, title: title.trim(), description: description.trim(), footer: footer.trim(), buttons }
        : { name: name.trim(), type, title: title.trim(), description: description.trim(), footer: footer.trim(), buttonText: buttonText.trim(), sections };
    if (template) await templatesApi.update(template.id, data);
    else await templatesApi.create(data);

    toast.success(template ? 'Template updated' : 'Template created');
    saved();
  };

  return <div className="templateModalBackdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
    <section className="templateModal">
      <header><div><p className="eyebrow">TEMPLATE</p><h2>{template ? 'Edit template' : 'New template'}</h2></div><button type="button" onClick={close}><X size={17} /></button></header>
      <div className="templateModalBody">
        <label>Template name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Welcome message" /></label>
        <div className="templateTypePicker">{typeOptions.map((option) => <button type="button" key={option.id} className={type === option.id ? 'active' : ''} onClick={() => setType(option.id)}><strong>{option.label}</strong><small>{option.description}</small></button>)}</div>
        {(type === 'text' || type === 'media-text') && <label>{type === 'media-text' ? 'Caption' : 'Message'}<textarea value={text} onChange={(event) => setText(event.target.value)} rows={8} placeholder="Hi {{name}}, ..." /></label>}
        {(['buttons','list','media-buttons','media-list'].includes(type)) && <>
          <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label>
          <label>Footer<input value={footer} onChange={(event) => setFooter(event.target.value)} /></label>
        </>}
        {['buttons','media-buttons'].includes(type) && <div className="templateEditorItems"><div className="templateEditorLabel">Reply buttons</div>{buttons.map((button, index) => <div className="templateItemRow" key={index}><input value={button.id} onChange={(event) => setButtons((items) => items.map((item, i) => i === index ? { ...item, id: event.target.value } : item))} placeholder="button_id" /><input value={button.displayText} onChange={(event) => setButtons((items) => items.map((item, i) => i === index ? { ...item, displayText: event.target.value } : item))} placeholder="Button text" /><button type="button" disabled={buttons.length <= 1} onClick={() => setButtons((items) => items.filter((_, i) => i !== index))}><Trash2 size={13} /></button></div>)}{buttons.length < 3 && <button type="button" className="secondary" onClick={() => setButtons((items) => [...items, { type: 'reply', id: `option_${items.length + 1}`, displayText: `Option ${items.length + 1}` }])}><Plus size={13} /> Add button</button>}</div>}
        {['list','media-list'].includes(type) && <div className="templateEditorItems"><label>Menu button text<input value={buttonText} onChange={(event) => setButtonText(event.target.value)} /></label>{sections.map((section, sectionIndex) => <div className="templateListSection" key={sectionIndex}><div className="templateItemRow"><input value={section.title} onChange={(event) => setSections((items) => items.map((item, i) => i === sectionIndex ? { ...item, title: event.target.value } : item))} placeholder="Section title" /><button type="button" disabled={sections.length <= 1} onClick={() => setSections((items) => items.filter((_, i) => i !== sectionIndex))}><Trash2 size={13} /></button></div>{section.rows.map((row, rowIndex) => <div className="templateItemRow" key={rowIndex}><input value={row.rowId} onChange={(event) => setSections((items) => items.map((item, i) => i === sectionIndex ? { ...item, rows: item.rows.map((current, j) => j === rowIndex ? { ...current, rowId: event.target.value } : current) } : item))} placeholder="row_id" /><input value={row.title} onChange={(event) => setSections((items) => items.map((item, i) => i === sectionIndex ? { ...item, rows: item.rows.map((current, j) => j === rowIndex ? { ...current, title: event.target.value } : current) } : item))} placeholder="Row title" /><button type="button" disabled={section.rows.length <= 1} onClick={() => setSections((items) => items.map((item, i) => i === sectionIndex ? { ...item, rows: item.rows.filter((_, j) => j !== rowIndex) } : item))}><Trash2 size={13} /></button></div>)}{section.rows.length < 10 && <button type="button" className="secondary" onClick={() => setSections((items) => items.map((item, i) => i === sectionIndex ? { ...item, rows: [...item.rows, { rowId: `option_${item.rows.length + 1}`, title: `Option ${item.rows.length + 1}`, description: '' }] } : item))}><Plus size={13} /> Add row</button>}</div>)}{sections.length < 5 && <button type="button" className="secondary" onClick={() => setSections((items) => [...items, { title: `Section ${items.length + 1}`, rows: [{ rowId: `option_${items.length + 1}`, title: 'New option', description: '' }] }])}><Plus size={13} /> Add section</button>}</div>}
        <div className="templateVariables"><strong>Personalization</strong><span>{'{{name}}'}</span><span>{'{{company}}'}</span><span>{'{{custom1}}'}</span><span>{'{{custom2}}'}</span></div>
      </div>
      <footer><button type="button" className="secondary" onClick={close}>Cancel</button><button type="button" className="primary" onClick={save}>{template ? 'Save changes' : 'Create template'}</button></footer>
    </section>
  </div>;
}
