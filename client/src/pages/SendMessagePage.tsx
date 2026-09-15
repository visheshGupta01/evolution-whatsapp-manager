import { ChangeEvent, useMemo, useRef, useState } from 'react';
import * as XLSX from '@keep-lts/xlsx';
import { Check, Download, FileSpreadsheet, FileText, Image, Loader2, MessageSquare, Paperclip, Send, Smartphone, Upload, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { useSessions } from '../hooks/use-sessions';
import { campaignsApi, type CampaignMedia, type CampaignRecipient, type CampaignResult } from '../lib/api';
import '../styles/send-message.css';
import '../styles/send-media.css';

type MessageType = 'text' | 'media' | 'media-text' | 'buttons' | 'list';
type RecipientRow = CampaignRecipient & { row: number; valid: boolean; error?: string };
type MediaDraft = CampaignMedia & { size: number; previewUrl?: string };

const messageTypes: { id: MessageType; label: string; description: string; icon: typeof MessageSquare; available: boolean }[] = [
  { id: 'text', label: 'Text', description: 'Plain WhatsApp message', icon: MessageSquare, available: true },
  { id: 'media', label: 'Media', description: 'Image, video or document', icon: Paperclip, available: true },
  { id: 'media-text', label: 'Media + Text', description: 'Media with a caption', icon: Image, available: true },
  { id: 'buttons', label: 'Buttons', description: 'Interactive reply buttons', icon: Smartphone, available: false },
  { id: 'list', label: 'List', description: 'Interactive list message', icon: FileText, available: false },
];

const PHONE_HEADERS = ['phone', 'number', 'mobile', 'mobilenumber', 'whatsapp', 'whatsappnumber', 'contact', 'phonenumber'];
const MAX_RECIPIENTS = 250;
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

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
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The workbook does not contain a sheet.');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (!rows.length) throw new Error('The spreadsheet is empty.');
  const headerMap = new Map<string, string>();
  Object.keys(rows[0]).forEach((key) => headerMap.set(normalizeHeader(key), key));
  const phoneHeader = PHONE_HEADERS.find((key) => headerMap.has(key));
  if (!phoneHeader) throw new Error('A phone column is required. Use phone, number, mobile or whatsapp.');
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

function readFileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read the media file.'));
    reader.readAsDataURL(file);
  });
}

function mediaTypeFor(file: File): CampaignMedia['mediatype'] | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type === 'application/pdf' || file.type.startsWith('text/') || file.type.includes('word') || file.type.includes('excel') || file.type.includes('powerpoint') || /\.(pdf|docx?|xlsx?|pptx?|txt)$/i.test(file.name)) return 'document';
  return null;
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function personalize(template: string, recipient?: CampaignRecipient) {
  return template.replace(/\{\{\s*(name|company|custom1|custom2)\s*\}\}/gi, (_, key) => String(recipient?.[key.toLowerCase() as keyof CampaignRecipient] ?? ''));
}

export function SendMessagePage() {
  const { data: sessions = [], isLoading } = useSessions();
  const connected = useMemo(() => sessions.filter(isOnline), [sessions]);
  const [instance, setInstance] = useState('');
  const [type, setType] = useState<MessageType>('text');
  const [draft, setDraft] = useState('');
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [media, setMedia] = useState<MediaDraft | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isMediaLoading, setIsMediaLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<CampaignResult | null>(null);
  const recipientFileRef = useRef<HTMLInputElement>(null);
  const mediaFileRef = useRef<HTMLInputElement>(null);

  const selectedInstance = connected.some((session) => session.instanceName === instance) ? instance : connected[0]?.instanceName || '';
  const validRecipients = useMemo(() => recipients.filter((recipient) => recipient.valid), [recipients]);
  const invalidRecipients = recipients.length - validRecipients.length;
  const sampleRecipient = validRecipients[0];
  const previewText = personalize(draft, sampleRecipient);
  const isMediaMode = type === 'media' || type === 'media-text';
  const captionEnabled = type === 'media-text';

  const handleRecipientFile = async (event: ChangeEvent<HTMLInputElement>) => {
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

  const handleMediaFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setIsMediaLoading(true);
    setResult(null);
    try {
      if (file.size > MAX_MEDIA_BYTES) throw new Error('Media must be 8 MB or smaller in Phase 3.');
      const mediatype = mediaTypeFor(file);
      if (!mediatype) throw new Error('Supported media: images, videos, PDF and common office/text documents.');
      const base64 = await readFileBase64(file);
      const next: MediaDraft = { base64, mediatype, mimetype: file.type || 'application/octet-stream', fileName: file.name, size: file.size };
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) next.previewUrl = URL.createObjectURL(file);
      setMedia(next);
      toast.success(`${file.name} attached`);
    } catch (error) {
      setMedia(null);
      toast.error(error instanceof Error ? error.message : 'Could not load media.');
    } finally {
      setIsMediaLoading(false);
    }
  };

  const clearMedia = () => {
    if (media?.previewUrl) URL.revokeObjectURL(media.previewUrl);
    setMedia(null);
    setResult(null);
  };

  const clearRecipients = () => {
    setRecipients([]);
    setFileName('');
    setResult(null);
  };

  const sendCampaign = async () => {
    if (!selectedInstance) return toast.error('Select a connected WhatsApp instance.');
    if (!validRecipients.length) return toast.error('Import at least one valid recipient.');
    if (isMediaMode && !media) return toast.error('Attach an image, video or document first.');
    if (!isMediaMode && !draft.trim()) return toast.error('Write a message first.');
    if (captionEnabled && !draft.trim()) return toast.error('Write a caption first.');

    setIsSending(true);
    setResult(null);
    try {
      const cleanRecipients = validRecipients.map(({ row: _row, valid: _valid, error: _error, ...recipient }) => recipient);
      const response = isMediaMode
        ? await campaignsApi.sendMedia(selectedInstance, media!, captionEnabled ? draft.trim() : '', cleanRecipients, 1500)
        : await campaignsApi.sendText(selectedInstance, draft.trim(), cleanRecipients, 1500);
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
      <section className="hero sendHero"><div><p className="eyebrow">CAMPAIGNS</p><h1>Send Message</h1><p>Import recipients and send personalized text, images, videos or documents through a connected WhatsApp session.</p></div><div className="sendStatus"><i /> Phase 3 · Media Campaigns</div></section>
      {!connected.length && !isLoading ? <section className="sendEmpty"><div className="sendEmptyIcon"><Smartphone size={24} /></div><h2>No connected session</h2><p>Connect a WhatsApp session first. Only connected sessions can be used for campaigns.</p></section> : <div className="sendLayout"><section className="sendCard">
        <div className="sendSection"><div className="sendSectionHead"><div className="stepNumber">1</div><div><h2>WhatsApp instance</h2><p>Select the connected number that will send the campaign.</p></div></div><div className="instanceGrid">{connected.map((session) => { const active = selectedInstance === session.instanceName; return <button type="button" key={session.instanceName} className={`instanceOption ${active ? 'active' : ''}`} onClick={() => setInstance(session.instanceName || '')}><div className="instanceIcon"><Smartphone size={18} /></div><div className="instanceCopy"><strong>{session.profileName || session.instanceName}</strong><span>{session.number ? `+${String(session.number).replace(/^\+/, '')}` : session.instanceName}</span></div><span className="onlineBadge"><i /> Connected</span>{active && <span className="selectedCheck"><Check size={13} /></span>}</button>; })}</div></div>
        <div className="sendDivider" />
        <div className="sendSection"><div className="sendSectionHead"><div className="stepNumber">2</div><div><h2>Recipients</h2><p>Upload an XLSX with a required <b>phone</b> column. Optional columns: name, company, custom1, custom2.</p></div></div><input ref={recipientFileRef} className="hiddenFileInput" type="file" accept=".xlsx,.xls,.csv" onChange={handleRecipientFile} /><div className="uploadRow"><button type="button" className="uploadDrop" onClick={() => recipientFileRef.current?.click()} disabled={isParsing}><span className="uploadIcon">{isParsing ? <Loader2 size={19} className="spin" /> : <Upload size={19} />}</span><span><strong>{isParsing ? 'Reading spreadsheet…' : 'Upload recipient XLSX'}</strong><small>XLSX, XLS or CSV · up to {MAX_RECIPIENTS} rows</small></span></button><button type="button" className="secondary templateBtn" onClick={downloadTemplate}><Download size={14} /> Template</button></div>{recipients.length > 0 && <><div className="recipientStats"><div><strong>{recipients.length}</strong><span>Rows</span></div><div className="valid"><strong>{validRecipients.length}</strong><span>Valid</span></div><div className={invalidRecipients ? 'invalid' : ''}><strong>{invalidRecipients}</strong><span>Invalid</span></div><div className="fileName"><FileSpreadsheet size={14} /><span>{fileName}</span><button type="button" onClick={clearRecipients}><X size={13} /></button></div></div><div className="recipientTableWrap"><table className="recipientTable"><thead><tr><th>Row</th><th>Phone</th><th>Name</th><th>Company</th><th>Status</th></tr></thead><tbody>{recipients.slice(0, 8).map((recipient) => <tr key={recipient.row} className={!recipient.valid ? 'invalidRow' : ''}><td>{recipient.row}</td><td>{recipient.phone || '—'}</td><td>{recipient.name || '—'}</td><td>{recipient.company || '—'}</td><td><span className={`rowStatus ${recipient.valid ? 'ok' : 'bad'}`}>{recipient.valid ? 'Valid' : recipient.error}</span></td></tr>)}</tbody></table>{recipients.length > 8 && <div className="tableMore">Showing first 8 rows · {recipients.length - 8} more will be included.</div>}</div></>}</div>
        <div className="sendDivider" />
        <div className="sendSection"><div className="sendSectionHead"><div className="stepNumber">3</div><div><h2>Message type</h2><p>Phase 3 adds image, video and document campaigns.</p></div></div><div className="messageTypeGrid">{messageTypes.map(({ id, label, description, icon: Icon, available }) => { const active = type === id; return <button type="button" key={id} disabled={!available} className={`messageTypeOption ${active ? 'active' : ''} ${!available ? 'disabled' : ''}`} onClick={() => available && setType(id)}><span className="typeIcon"><Icon size={17} /></span><span className="typeCopy"><strong>{label}</strong><small>{description}</small></span>{!available && <span className="comingSoon">Soon</span>}{active && <span className="selectedCheck"><Check size={13} /></span>}</button>; })}</div></div>
        {isMediaMode && <><div className="sendDivider" /><div className="sendSection"><div className="sendSectionHead"><div className="stepNumber">4</div><div><h2>Media</h2><p>Attach one image, video or document. The same media is sent to every valid recipient.</p></div></div><input ref={mediaFileRef} className="hiddenFileInput" type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt" onChange={handleMediaFile} />{!media ? <button type="button" className="mediaDrop" onClick={() => mediaFileRef.current?.click()} disabled={isMediaLoading}><span className="mediaDropIcon">{isMediaLoading ? <Loader2 size={22} className="spin" /> : <Upload size={22} />}</span><strong>{isMediaLoading ? 'Reading media…' : 'Choose media'}</strong><small>Images, videos, PDF and common documents · max 8 MB</small></button> : <div className="mediaAttachment"><div className="mediaThumb">{media.previewUrl && media.mediatype === 'image' ? <img src={media.previewUrl} alt="Media preview" /> : media.previewUrl && media.mediatype === 'video' ? <video src={media.previewUrl} controls /> : media.mediatype === 'document' ? <FileText size={26} /> : <Paperclip size={26} />}</div><div className="mediaInfo"><strong>{media.fileName}</strong><span>{media.mediatype} · {formatBytes(media.size)} · {media.mimetype}</span></div><button type="button" className="clearBtn" onClick={clearMedia}><X size={14} /> Remove</button></div>}</div></>}
        <div className="sendDivider" />
        <div className="sendSection composerSection"><div className="sendSectionHead"><div className="stepNumber">{isMediaMode ? 5 : 4}</div><div><h2>{isMediaMode ? 'Caption' : 'Compose message'}</h2><p>{isMediaMode ? (captionEnabled ? 'Use the same personalization fields in the media caption.' : 'Media-only mode sends no caption.') : 'Use {{name}}, {{company}}, {{custom1}} or {{custom2}} for spreadsheet personalization.'}</p></div></div><div className="composerGrid"><div className="editorWrap"><div className="editorToolbar"><span>{isMediaMode ? 'Media caption' : 'Text message'}</span><span>{draft.length} characters</span></div><textarea value={draft} onChange={(event) => setDraft(event.target.value)} disabled={isMediaMode && !captionEnabled} placeholder={isMediaMode ? 'Hi {{name}}, here is the document…' : 'Hi {{name}}, thanks for your interest…'} rows={9} /><div className="editorFooter"><span>{isMediaMode && !captionEnabled ? 'Switch to Media + Text to add a caption.' : 'Missing placeholder values are replaced with an empty string.'}</span><button type="button" className="clearBtn" disabled={!draft} onClick={() => setDraft('')}><X size={13} /> Clear</button></div></div><div className="previewWrap"><div className="previewHead"><span>Preview</span><span className="previewDevice"><Smartphone size={12} /> {sampleRecipient ? `For ${sampleRecipient.name || sampleRecipient.phone}` : 'WhatsApp'}</span></div><div className="phonePreview"><div className="previewTop"><div className="previewAvatar"><MessageSquare size={13} /></div><div><strong>{sampleRecipient?.name || 'Recipient'}</strong><span>WhatsApp</span></div></div><div className="previewBody">{media ? <div className="previewMediaBubble">{media.previewUrl && media.mediatype === 'image' ? <img src={media.previewUrl} alt="Preview" /> : media.previewUrl && media.mediatype === 'video' ? <video src={media.previewUrl} controls /> : <div className="previewDocument"><FileText size={25} /><span>{media.fileName}</span></div>}{captionEnabled && previewText && <p>{previewText}</p>}<span>10:42 ✓✓</span></div> : !isMediaMode && previewText ? <div className="previewBubble"><p>{previewText}</p><span>10:42 ✓✓</span></div> : <div className="previewPlaceholder">Your message preview will appear here.</div>}</div></div></div></div></div>
        {result && <div className="campaignResult"><div><strong>Campaign finished</strong><span>{result.sent} sent · {result.failed} failed · {result.total} total</span></div><div className="resultBar"><i style={{ width: `${result.total ? (result.sent / result.total) * 100 : 0}%` }} /></div>{result.failed > 0 && <div className="resultErrors">{result.results.filter((item) => !item.ok).slice(0, 5).map((item) => <div key={item.index}><span>+{item.phone}</span><small>{item.message || 'Send failed'}</small></div>)}</div>}</div>}
      </section><aside className="sendAside"><div className="summaryCard"><div className="summaryHeader"><Send size={15} /><span>Campaign summary</span></div><div className="summaryRow"><span>Type</span><strong>{isMediaMode ? (captionEnabled ? 'Media + Text' : 'Media') : 'Text'}</strong></div><div className="summaryRow"><span>Instance</span><strong>{selectedInstance || 'Not selected'}</strong></div><div className="summaryRow"><span>Recipients</span><strong>{validRecipients.length}</strong></div>{isMediaMode && <div className="summaryRow"><span>Media</span><strong>{media ? media.fileName : 'Not attached'}</strong></div>}<div className="summaryRow"><span>Pacing</span><strong>1.5 sec</strong></div><button type="button" className="primary sendButton" onClick={sendCampaign} disabled={isSending || !selectedInstance || !validRecipients.length || (isMediaMode ? !media : !draft.trim())}>{isSending ? <><Loader2 size={16} className="spin" /> Sending…</> : <><Send size={16} /> Send campaign</>}</button><p className="summaryNote">Phase 3 limit: {MAX_RECIPIENTS} recipients and 8 MB media. Keep campaigns limited to recipients who have opted in.</p></div></aside></div>}
    </div>
  );
}
