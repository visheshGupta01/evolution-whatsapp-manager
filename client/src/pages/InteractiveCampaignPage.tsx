import { ChangeEvent, useMemo, useState } from 'react';
import * as XLSX from '@keep-lts/xlsx';
import { Check, FileSpreadsheet, List, Loader2, MessageSquare, Plus, Send, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSessions } from '../hooks/use-sessions';
import { campaignsApi, type CampaignButton, type CampaignList, type CampaignListRow, type CampaignRecipient, type CampaignResult } from '../lib/api';
import '../styles/interactive-campaign.css';

type Mode = 'buttons' | 'list';

type RecipientRow = CampaignRecipient & { valid: boolean; row: number };

const aliases = ['phone', 'number', 'mobile', 'whatsapp', 'whatsappnumber', 'phonenumber'];

function normalizeHeader(value: unknown) { return String(value ?? '').toLowerCase().trim().replace(/[\s_-]+/g, ''); }
function parseRecipients(data: ArrayBuffer): RecipientRow[] {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The spreadsheet is empty.');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (!rows.length) throw new Error('The spreadsheet is empty.');
  const headers = new Map<string, string>();
  Object.keys(rows[0]).forEach((key) => headers.set(normalizeHeader(key), key));
  const phoneKey = aliases.map((key) => headers.get(key)).find(Boolean);
  if (!phoneKey) throw new Error('Add a phone column to the spreadsheet.');
  const seen = new Set<string>();
  return rows.slice(0, 250).map((row, index) => {
    const phone = String(row[phoneKey] ?? '').replace(/[^0-9]/g, '');
    const valid = phone.length >= 8 && phone.length <= 15 && !seen.has(phone);
    if (phone) seen.add(phone);
    const get = (name: string) => { const key = headers.get(name); return key ? String(row[key] ?? '').trim() : undefined; };
    return { row: index + 2, phone, name: get('name'), company: get('company'), custom1: get('custom1'), custom2: get('custom2'), valid };
  });
}

function personalize(value: string, recipient: CampaignRecipient) { return value.replace(/\{\{\s*(name|company|custom1|custom2)\s*\}\}/gi, (_, key) => String(recipient[key.toLowerCase() as keyof CampaignRecipient] ?? '')); }

export function InteractiveCampaignPage() {
  const { data: sessions = [] } = useSessions();
  const connected = useMemo(() => sessions.filter((session) => ['open', 'connected', 'online'].includes(String(session.state || session.status || '').toLowerCase())), [sessions]);
  const [instance, setInstance] = useState('');
  const [mode, setMode] = useState<Mode>('buttons');
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [title, setTitle] = useState('Choose an option');
  const [description, setDescription] = useState('Hi {{name}}, please choose one of the options below.');
  const [footer, setFooter] = useState('Reply with your choice');
  const [buttonItems, setButtonItems] = useState<CampaignButton[]>([
    { type: 'reply', id: 'option_1', displayText: 'Option 1' },
    { type: 'reply', id: 'option_2', displayText: 'Option 2' },
  ]);
  const [buttonText, setButtonText] = useState('View options');
  const [sections, setSections] = useState([{ title: 'Options', rows: [{ title: 'Option 1', description: 'First option', rowId: 'option_1' }, { title: 'Option 2', description: 'Second option', rowId: 'option_2' }] as CampaignListRow[] }]);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<CampaignResult | null>(null);

  const selectedInstance = connected.some((session) => session.instanceName === instance) ? instance : connected[0]?.instanceName || '';
  const validRecipients = recipients.filter((recipient) => recipient.valid);
  const sample = validRecipients[0];

  const importRecipients = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try { const rows = parseRecipients(await file.arrayBuffer()); setRecipients(rows); setResult(null); toast.success(`Imported ${rows.filter((row) => row.valid).length} valid recipients`); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not read recipients.'); }
  };

  const send = async () => {
    if (!selectedInstance) return toast.error('Select a connected instance.');
    if (!validRecipients.length) return toast.error('Import at least one valid recipient.');
    setIsSending(true); setResult(null);
    try {
      const clean = validRecipients.map(({ row: _row, valid: _valid, ...recipient }) => recipient);
      const response = mode === 'buttons'
        ? await campaignsApi.sendButtons(selectedInstance, { title, description, footer, buttons: buttonItems }, clean, 1500)
        : await campaignsApi.sendList(selectedInstance, { title, description, footerText: footer, buttonText, sections }, clean, 1500);
      setResult(response);
      if (response.failed) toast.warning(`${response.sent} sent, ${response.failed} failed`); else toast.success(`${response.sent} interactive messages sent`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Campaign failed.'); }
    finally { setIsSending(false); }
  };

  const previewTitle = sample ? personalize(title, sample) : title;
  const previewDescription = sample ? personalize(description, sample) : description;

  return <div className="interactivePage">
    <section className="hero interactiveHero"><div><p className="eyebrow">CAMPAIGNS · PHASE 4</p><h1>Interactive Message</h1><p>Create reply-button or list campaigns with the same recipient personalization used by text and media campaigns.</p></div><div className="interactiveTag"><i /> Buttons + Lists</div></section>
    {!connected.length ? <section className="interactiveEmpty"><Smartphone size={24} /><h2>No connected session</h2><p>Connect a WhatsApp session before sending an interactive campaign.</p></section> : <div className="interactiveGrid">
      <main className="interactiveCard">
        <section className="interactiveSection"><div className="interactiveHead"><b>1</b><div><h2>Instance & recipients</h2><p>Use the same XLSX recipient format as the main campaign builder.</p></div></div><div className="instanceLine"><select value={selectedInstance} onChange={(event) => setInstance(event.target.value)}><option value="">Select instance</option>{connected.map((session) => <option key={session.instanceName} value={session.instanceName}>{session.profileName || session.instanceName} {session.number ? `(+${String(session.number).replace(/^\+/, '')})` : ''}</option>)}</select><label className="fileButton"><FileSpreadsheet size={14} /> Import XLSX<input type="file" accept=".xlsx,.xls,.csv" onChange={importRecipients} /></label></div>{recipients.length > 0 && <div className="recipientMini"><strong>{validRecipients.length} valid</strong><span>{recipients.length - validRecipients.length} invalid / duplicate</span></div>}</section>
        <div className="interactiveDivider" />
        <section className="interactiveSection"><div className="interactiveHead"><b>2</b><div><h2>Message format</h2><p>Choose one interactive message type.</p></div></div><div className="modeTabs"><button className={mode === 'buttons' ? 'active' : ''} onClick={() => setMode('buttons')}><MessageSquare size={15} /> Reply buttons</button><button className={mode === 'list' ? 'active' : ''} onClick={() => setMode('list')}><List size={15} /> List menu</button></div><div className="fieldGrid"><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label><label>Footer<input value={footer} onChange={(event) => setFooter(event.target.value)} /></label>{mode === 'list' && <label>Menu button text<input value={buttonText} onChange={(event) => setButtonText(event.target.value)} /></label>}</div></section>
        <div className="interactiveDivider" />
        {mode === 'buttons' ? <section className="interactiveSection"><div className="interactiveHead"><b>3</b><div><h2>Buttons</h2><p>1–3 unique reply buttons. IDs are used for downstream handling.</p></div></div><div className="itemList">{buttonItems.map((button, index) => <div className="itemRow" key={button.id || index}><input value={button.id || ''} onChange={(event) => setButtonItems(buttonItems.map((item, i) => i === index ? { ...item, id: event.target.value } : item))} placeholder="button_id" /><input value={button.displayText} onChange={(event) => setButtonItems(buttonItems.map((item, i) => i === index ? { ...item, displayText: event.target.value } : item))} placeholder="Display text" /><button disabled={buttonItems.length <= 1} onClick={() => setButtonItems(buttonItems.filter((_, i) => i !== index))}><Trash2 size={14} /></button></div>)}</div>{buttonItems.length < 3 && <button className="addButton" onClick={() => setButtonItems([...buttonItems, { type: 'reply', id: `option_${buttonItems.length + 1}`, displayText: `Option ${buttonItems.length + 1}` }])}><Plus size={14} /> Add button</button>}</section> : <section className="interactiveSection"><div className="interactiveHead"><b>3</b><div><h2>List rows</h2><p>Up to 10 rows across all sections.</p></div></div>{sections.map((section, sectionIndex) => <div className="listSection" key={sectionIndex}><div className="listSectionTitle"><input value={section.title} onChange={(event) => setSections(sections.map((item, i) => i === sectionIndex ? { ...item, title: event.target.value } : item))} /><button disabled={sections.length <= 1} onClick={() => setSections(sections.filter((_, i) => i !== sectionIndex))}><Trash2 size={14} /></button></div>{section.rows.map((row, rowIndex) => <div className="itemRow" key={rowIndex}><input value={row.rowId} onChange={(event) => setSections(sections.map((item, i) => i === sectionIndex ? { ...item, rows: item.rows.map((r, j) => j === rowIndex ? { ...r, rowId: event.target.value } : r) } : item))} /><input value={row.title} onChange={(event) => setSections(sections.map((item, i) => i === sectionIndex ? { ...item, rows: item.rows.map((r, j) => j === rowIndex ? { ...r, title: event.target.value } : r) } : item))} /><input value={row.description || ''} onChange={(event) => setSections(sections.map((item, i) => i === sectionIndex ? { ...item, rows: item.rows.map((r, j) => j === rowIndex ? { ...r, description: event.target.value } : r) } : item))} /><button disabled={section.rows.length <= 1} onClick={() => setSections(sections.map((item, i) => i === sectionIndex ? { ...item, rows: item.rows.filter((_, j) => j !== rowIndex) } : item))}><Trash2 size={14} /></button></div>)}{sections.reduce((total, item) => total + item.rows.length, 0) < 10 && <button className="addButton" onClick={() => setSections(sections.map((item, i) => i === sectionIndex ? { ...item, rows: [...item.rows, { title: `Option ${item.rows.length + 1}`, description: '', rowId: `option_${item.rows.length + 1}` }] } : item))}><Plus size={14} /> Add row</button>}</div>)}{sections.length < 5 && <button className="addButton" onClick={() => setSections([...sections, { title: `Section ${sections.length + 1}`, rows: [{ title: 'New option', description: '', rowId: `option_${sections.length + 1}` }] }])}><Plus size={14} /> Add section</button>}</section>}
        {result && <div className="interactiveResult"><strong>Campaign finished</strong><span>{result.sent} sent · {result.failed} failed · {result.total} total</span></div>}
      </main>
      <aside className="interactiveAside"><div className="interactivePreview"><div className="previewHeader"><MessageSquare size={14} /><span>WhatsApp preview</span></div><div className="interactiveBubble"><strong>{previewTitle}</strong><p>{previewDescription}</p>{mode === 'buttons' ? <div className="previewButtons">{buttonItems.map((button) => <span key={button.id}>{button.displayText}</span>)}</div> : <><div className="previewListButton">{buttonText}</div><div className="previewRows">{sections.flatMap((section) => section.rows).slice(0, 4).map((row) => <div key={row.rowId}><strong>{row.title}</strong><small>{row.description}</small></div>)}</div></>}<small className="previewFooter">{footer}</small></div></div><div className="interactiveSend"><div><strong>{validRecipients.length}</strong><span>valid recipients</span></div><button onClick={send} disabled={isSending || !selectedInstance || !validRecipients.length}>{isSending ? <><Loader2 size={15} className="spin" /> Sending…</> : <><Send size={15} /> Send campaign</>}</button><p>Phase 4 keeps the 250-recipient limit and 1.5 sec pacing. Use only with recipients who have opted in.</p></div></aside>
    </div>}
  </div>;
}
