import { ChangeEvent, useMemo, useRef, useState } from 'react';
import * as XLSX from '@keep-lts/xlsx';
import { Check, Download, FileSpreadsheet, FileText, Image, Loader2, MessageSquare, Paperclip, Send, Smartphone, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { useSessions } from '../hooks/use-sessions';
import { campaignsApi, type CampaignRecipient } from '../lib/api';
import '../styles/send-message.css';

type MessageType = 'text' | 'media' | 'media-text' | 'buttons' | 'list';

type RecipientRow = CampaignRecipient & { row: number; valid: boolean; error?: string };

type CampaignResult = {
  ok: boolean;
  total: number;
  sent: number;
  failed: number;
  results: Array<{ index: number; phone: string; ok: boolean; message?: string }>;
};

const messageTypes: { id: MessageType; label: string; description: string; icon: typeof MessageSquare; available: boolean }[] = [
  { id: 'text', label: 'Text', description: 'Plain WhatsApp message', icon: MessageSquare, available: true },
  { id: 'media', label: 'Media', description: 'Image, video or document', icon: Paperclip, available: false },
  { id: 'media-text', label: 'Media + Text', description: 'Media with a caption', icon: Image, available: false },
  { id: 'buttons', label: 'Buttons', description: 'Interactive reply buttons', icon: Smartphone, available: false },
  { id: 'list', label: 'List', description: 'Interactive list message', icon: FileText, available: false },
];

const PHONE_HEADERS = ['phone', 'number', 'mobile', 'mobilenumber', 'whatsapp', 'whatsappnumber', 'contact', 'phonenumber'];
const OPTIONAL_HEADERS = ['name', 'company', 'custom1', 'custom2'];
const MAX_RECIPIENTS = 250;

function isOnline(session: { state?: string; status?: string }) {
  return ['open', 'connected', 'online'].includes(String(session.state || session.status || '').toLowerCase());
}

function normalizeHeader(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function normalizePhone(value: unknown) {
  return String(value ?? '').trim().replace(/[^0-9]/g, '');
}

function parseRecipientSheet(data: ArrayBuffer): RecipientRow[] {
  const workbook = XLSX.read(data, { type: 'array' });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) throw new Error('The workbook does not contain a sheet.');

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });
  if (!rows.length) throw new Error('The spreadsheet is empty.');

  const firstRow = rows[0];
  const headerMap = new Map<string, string>();
  Object.keys(firstRow).forEach((key) => headerMap.set(normalizeHeader(key), key));
  const phoneHeader = PHONE_HEADERS.find((key) => headerMap.has(key));
  if (!phoneHeader) throw new Error('A phone column is required. Use a header such as phone, number, mobile or whatsapp.');

  const phoneKey = headerMap.get(phoneHeader)!;
  const getValue = (row: Record<string, unknown>, header: string) => {
    const key = headerMap.get(header);
    return key ? String(row[key] ?? '').trim() : '';
  };

  const seen = new Set<string>();
  return rows.map((row, index) => {
    const phone = normalizePhone(row[phoneKey]);
    let error = '';
    if (!phone) error = 'Missing phone number';
    else if (phone.length < 8 || phone.length > 15) error = 'Phone must contain 8–15 digits';
    else if (seen.has(phone)) error = 'Duplicate phone number';
    else seen.add(phone);

    return {
      row: index + 2,
      phone,
      name: getValue(row, 'name') || undefined,
      company: getValue(row, 'company') || undefined,
      custom1: getValue(row, 'custom1') || undefined,
      custom2: getValue(row, 'custom2') || undefined,
      valid: !error,
      error: error || undefined,
    };
  });
}

function downloadTemplate() {
  const rows = [
    { phone: '919876543210', name: 'Rahul', company: 'Acme', custom1: 'Premium', custom2: 'Delhi' },
    { phone: '919812345678', name: 'Priya', company: 'Beta Ltd', custom1: 'New', custom2: 'Mumbai' },
  ];
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Recipients');
  XLSX.writeFile(workbook, 'whatsapp-recipients-template.xlsx');
}

export function SendMessagePage() {
  const { data: sessions = [], isLoading } = useSessions();
  const connected = useMemo(() => sessions.filter(isOnline), [sessions]);
  const [instance, setInstance] = useState('');
  const [type, setType] = useState<MessageType>('text');
  const [draft, setDraft] = useState('');
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<CampaignResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedInstance = connected.some((session) => session.instanceName === instance) ? instance : connected[0]?.instanceName || '';
  const validRecipients = useMemo(() => recipients.filter((recipient) => recipient.valid), [recipients]);
  const invalidRecipients = recipients.length - validRecipients.length;
  const sampleRecipient = validRecipients[0];
  const previewText = sampleRecipient
    ? draft.replace(/\{\{\s*(name|company|custom1|custom2)\s*\}\}/gi, (_, key) => String(sampleRecipient[key.toLowerCase() as keyof CampaignRecipient] ?? ''))
    : draft;

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsParsing(true);
    setResult(null);
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('Please upload an XLSX, XLS or CSV file.');
      const rows = parseRecipientSheet(await file.arrayBuffer());
      if (rows.length > MAX_RECIPIENTS) throw new Error(`This phase supports up to ${MAX_RECIPIENTS} spreadsheet rows per campaign.`);
      setRecipients(rows);
      setFileName(file.name);
      toast.success(`Imported ${rows.length} recipient rows`);
    } catch (error) {
      setRecipients([]);
      setFileName('');
      toast.error(error instanceof Error ? error.message : 'Could not read the spreadsheet.');
    } finally {
      setIsParsing(false);
    }
  };

  const clearRecipients = () => {
    setRecipients([]);
    setFileName('');
    setResult(null);
  };

  const sendCampaign = async () => {
    if (!selectedInstance) return toast.error('Select a connected WhatsApp instance.');
    if (!draft.trim()) return toast.error('Write a message first.');
    if (!validRecipients.length) return toast.error('Import at least one valid recipient.');

    setIsSending(true);
    setResult(null);
    try {
      const response = await campaignsApi.sendText(
        selectedInstance,
        draft.trim(),
        validRecipients.map(({ row: _row, valid: _valid, error: _error, ...recipient }) => recipient),
        1500,
      );
      setResult(response);
      if (response.failed) toast.warning(`${response.sent} sent, ${response.failed} failed`);
      else toast.success(`${response.sent} messages sent`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Campaign failed.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="sendPage">
      <section className="hero sendHero">
        <div>
          <p className="eyebrow">CAMPAIGNS</p>
          <h1>Send Message</h1>
          <p>Import recipients, personalize a text message and send it through a connected WhatsApp session.</p>
        </div>
        <div className="sendStatus"><i /> Phase 2 · XLSX + Text Campaign</div>
      </section>

      {!connected.length && !isLoading ? (
        <section className="sendEmpty">
          <div className="sendEmptyIcon"><Smartphone size={24} /></div>
          <h2>No connected session</h2>
          <p>Connect a WhatsApp session first. Only connected sessions can be used for campaigns.</p>
        </section>
      ) : (
        <div className="sendLayout">
          <section className="sendCard">
            <div className="sendSection">
              <div className="sendSectionHead"><div className="stepNumber">1</div><div><h2>WhatsApp instance</h2><p>Select the connected number that will send the campaign.</p></div></div>
              <div className="instanceGrid">
                {connected.map((session) => {
                  const active = selectedInstance === session.instanceName;
                  return <button type="button" key={session.instanceName} className={`instanceOption ${active ? 'active' : ''}`} onClick={() => setInstance(session.instanceName || '')}>
                    <div className="instanceIcon"><Smartphone size={18} /></div>
                    <div className="instanceCopy"><strong>{session.profileName || session.instanceName}</strong><span>{session.number ? `+${String(session.number).replace(/^\+/, '')}` : session.instanceName}</span></div>
                    <span className="onlineBadge"><i /> Connected</span>
                    {active && <span className="selectedCheck"><Check size={13} /></span>}
                  </button>;
                })}
              </div>
            </div>

            <div className="sendDivider" />

            <div className="sendSection">
              <div className="sendSectionHead"><div className="stepNumber">2</div><div><h2>Recipients</h2><p>Upload an XLSX with a required <b>phone</b> column. Optional columns: name, company, custom1, custom2.</p></div></div>
              <input ref={fileInputRef} className="hiddenFileInput" type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} />
              <div className="uploadRow">
                <button type="button" className="uploadDrop" onClick={() => fileInputRef.current?.click()} disabled={isParsing}>
                  <span className="uploadIcon">{isParsing ? <Loader2 size={19} className="spin" /> : <Upload size={19} />}</span>
                  <span><strong>{isParsing ? 'Reading spreadsheet…' : 'Upload recipient XLSX'}</strong><small>Drag/drop is not required · XLSX, XLS or CSV</small></span>
                </button>
                <button type="button" className="secondary templateBtn" onClick={downloadTemplate}><Download size={14} /> Template</button>
              </div>

              {recipients.length > 0 && (
                <div className="recipientStats">
                  <div><strong>{recipients.length}</strong><span>Rows</span></div>
                  <div className="valid"><strong>{validRecipients.length}</strong><span>Valid</span></div>
                  <div className={invalidRecipients ? 'invalid' : ''}><strong>{invalidRecipients}</strong><span>Invalid</span></div>
                  <div className="fileName"><FileSpreadsheet size={14} /><span>{fileName}</span><button type="button" onClick={clearRecipients}><X size={13} /></button></div>
                </div>
              )}

              {recipients.length > 0 && (
                <div className="recipientTableWrap">
                  <table className="recipientTable">
                    <thead><tr><th>Row</th><th>Phone</th><th>Name</th><th>Company</th><th>Status</th></tr></thead>
                    <tbody>
                      {recipients.slice(0, 8).map((recipient) => <tr key={recipient.row} className={!recipient.valid ? 'invalidRow' : ''}>
                        <td>{recipient.row}</td><td>{recipient.phone || '—'}</td><td>{recipient.name || '—'}</td><td>{recipient.company || '—'}</td><td><span className={`rowStatus ${recipient.valid ? 'ok' : 'bad'}`}>{recipient.valid ? 'Valid' : recipient.error}</span></td>
                      </tr>)}
                    </tbody>
                  </table>
                  {recipients.length > 8 && <div className="tableMore">Showing first 8 rows · {recipients.length - 8} more will be included.</div>}
                </div>
              )}
            </div>

            <div className="sendDivider" />

            <div className="sendSection">
              <div className="sendSectionHead"><div className="stepNumber">3</div><div><h2>Message type</h2><p>Text campaigns are enabled in Phase 2.</p></div></div>
              <div className="messageTypeGrid">
                {messageTypes.map(({ id, label, description, icon: Icon, available }) => {
                  const active = type === id;
                  return <button type="button" key={id} disabled={!available} className={`messageTypeOption ${active ? 'active' : ''} ${!available ? 'disabled' : ''}`} onClick={() => available && setType(id)}>
                    <span className="typeIcon"><Icon size={17} /></span><span className="typeCopy"><strong>{label}</strong><small>{description}</small></span>{!available && <span className="comingSoon">Soon</span>}{active && <span className="selectedCheck"><Check size={13} /></span>}
                  </button>;
                })}
              </div>
            </div>

            <div className="sendDivider" />

            <div className="sendSection composerSection">
              <div className="sendSectionHead"><div className="stepNumber">4</div><div><h2>Compose message</h2><p>Use {'{{name}}'}, {'{{company}}'}, {'{{custom1}}'} or {'{{custom2}}'} for spreadsheet personalization.</p></div></div>
              <div className="composerGrid">
                <div className="editorWrap">
                  <div className="editorToolbar"><span>Text message</span><span>{draft.length} characters</span></div>
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Hi {{name}}, thanks for your interest…" rows={9} />
                  <div className="editorFooter"><span>Recipients without a value for a placeholder receive an empty string for that field.</span><button type="button" className="clearBtn" disabled={!draft} onClick={() => setDraft('')}><X size={13} /> Clear</button></div>
                </div>
                <div className="previewWrap">
                  <div className="previewHead"><span>Preview</span><span className="previewDevice"><Smartphone size={12} /> {sampleRecipient ? `For ${sampleRecipient.name || sampleRecipient.phone}` : 'WhatsApp'}</span></div>
                  <div className="phonePreview">
                    <div className="previewTop"><div className="previewAvatar"><MessageSquare size={13} /></div><div><strong>{sampleRecipient?.name || 'Recipient'}</strong><span>WhatsApp</span></div></div>
                    <div className="previewBody">{previewText ? <div className="previewBubble"><p>{previewText}</p><span>10:42 ✓✓</span></div> : <div className="previewPlaceholder">Your message preview will appear here.</div>}</div>
                  </div>
                </div>
              </div>
            </div>

            {result && (
              <div className="campaignResult">
                <div><strong>Campaign finished</strong><span>{result.sent} sent · {result.failed} failed · {result.total} total</span></div>
                <div className="resultBar"><i style={{ width: `${result.total ? (result.sent / result.total) * 100 : 0}%` }} /></div>
              </div>
            )}

            <div className="sendActions">
              <div><strong>Ready to send?</strong><span>Only valid imported recipients are included. Minimum server pacing is 1.2 seconds.</span></div>
              <button type="button" className="primary sendButton" disabled={isSending || !selectedInstance || !draft.trim() || !validRecipients.length} onClick={sendCampaign}>
                {isSending ? <><Loader2 size={15} className="spin" /> Sending…</> : <><Send size={15} /> Send to {validRecipients.length || 0}</>}
              </button>
            </div>
          </section>

          <aside className="sendSummary">
            <div className="summaryHead"><span>Campaign setup</span><span className="phaseTag">PHASE 2</span></div>
            <div className="summaryRow"><span>Instance</span><strong>{selectedInstance || 'Not selected'}</strong></div>
            <div className="summaryRow"><span>Message type</span><strong>Text</strong></div>
            <div className="summaryRow"><span>Recipients</span><strong>{validRecipients.length ? `${validRecipients.length} valid` : 'Not imported'}</strong></div>
            <div className="summaryRow"><span>Personalization</span><strong>{sampleRecipient ? 'Enabled' : 'Ready after import'}</strong></div>
            <div className="summaryDivider" />
            <div className="nextStep"><span>Spreadsheet format</span><strong>phone · name · company</strong><p>Phone is required. Names and custom fields can be used inside the message with {'{{placeholders}}'}.</p></div>
            <button type="button" className="secondary summaryButton" onClick={downloadTemplate}><Download size={13} /> Download XLSX template</button>
            <div className="campaignNotice"><strong>Use only opted-in recipients.</strong><span>Phase 2 uses conservative sequential sending. Larger persistent campaigns will move to the queue/worker phase.</span></div>
          </aside>
        </div>
      )}
    </div>
  );
}
