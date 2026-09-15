import { useMemo, useState } from 'react';
import { Check, FileText, Image, MessageSquare, Paperclip, Smartphone, Video, X } from 'lucide-react';
import { useSessions } from '../hooks/use-sessions';
import '../styles/send-message.css';

type MessageType = 'text' | 'media' | 'media-text' | 'buttons' | 'list';

const messageTypes: { id: MessageType; label: string; description: string; icon: typeof MessageSquare; available: boolean }[] = [
  { id: 'text', label: 'Text', description: 'Plain WhatsApp message', icon: MessageSquare, available: true },
  { id: 'media', label: 'Media', description: 'Image, video or document', icon: Paperclip, available: false },
  { id: 'media-text', label: 'Media + Text', description: 'Media with a caption', icon: Image, available: false },
  { id: 'buttons', label: 'Buttons', description: 'Interactive reply buttons', icon: Smartphone, available: false },
  { id: 'list', label: 'List', description: 'Interactive list message', icon: FileText, available: false },
];

function isOnline(session: { state?: string; status?: string }) {
  return ['open', 'connected', 'online'].includes(String(session.state || session.status || '').toLowerCase());
}

export function SendMessagePage() {
  const { data: sessions = [], isLoading } = useSessions();
  const connected = useMemo(() => sessions.filter(isOnline), [sessions]);
  const [instance, setInstance] = useState('');
  const [type, setType] = useState<MessageType>('text');
  const [draft, setDraft] = useState('');

  const selectedInstance = connected.some((session) => session.instanceName === instance) ? instance : connected[0]?.instanceName || '';

  return (
    <div className="sendPage">
      <section className="hero sendHero">
        <div>
          <p className="eyebrow">CAMPAIGNS</p>
          <h1>Send Message</h1>
          <p>Choose a connected WhatsApp session and compose a message. Recipient import and campaign sending will be added next.</p>
        </div>
        <div className="sendStatus"><i /> Phase 1 · Composer</div>
      </section>

      {!connected.length && !isLoading ? (
        <section className="sendEmpty">
          <div className="sendEmptyIcon"><Smartphone size={24} /></div>
          <h2>No connected session</h2>
          <p>Connect a WhatsApp session first. Only connected sessions can be selected for sending.</p>
        </section>
      ) : (
        <div className="sendLayout">
          <section className="sendCard">
            <div className="sendSection">
              <div className="sendSectionHead">
                <div className="stepNumber">1</div>
                <div><h2>WhatsApp instance</h2><p>Select the connected number that will send the campaign.</p></div>
              </div>
              <div className="instanceGrid">
                {connected.map((session) => {
                  const active = selectedInstance === session.instanceName;
                  return (
                    <button key={session.instanceName} className={`instanceOption ${active ? 'active' : ''}`} onClick={() => setInstance(session.instanceName || '')}>
                      <div className="instanceIcon"><Smartphone size={18} /></div>
                      <div className="instanceCopy"><strong>{session.profileName || session.instanceName}</strong><span>{session.number ? `+${String(session.number).replace(/^\+/, '')}` : session.instanceName}</span></div>
                      <span className="onlineBadge"><i /> Connected</span>
                      {active && <span className="selectedCheck"><Check size={13} /></span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sendDivider" />

            <div className="sendSection">
              <div className="sendSectionHead">
                <div className="stepNumber">2</div>
                <div><h2>Message type</h2><p>Choose the format you want to compose.</p></div>
              </div>
              <div className="messageTypeGrid">
                {messageTypes.map(({ id, label, description, icon: Icon, available }) => {
                  const active = type === id;
                  return (
                    <button key={id} disabled={!available} className={`messageTypeOption ${active ? 'active' : ''} ${!available ? 'disabled' : ''}`} onClick={() => available && setType(id)}>
                      <span className="typeIcon"><Icon size={17} /></span>
                      <span className="typeCopy"><strong>{label}</strong><small>{description}</small></span>
                      {!available && <span className="comingSoon">Soon</span>}
                      {active && <span className="selectedCheck"><Check size={13} /></span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sendDivider" />

            <div className="sendSection composerSection">
              <div className="sendSectionHead">
                <div className="stepNumber">3</div>
                <div><h2>Compose message</h2><p>Write the message that will be sent to your recipients.</p></div>
              </div>
              <div className="composerGrid">
                <div className="editorWrap">
                  <div className="editorToolbar"><span>Text message</span><span>{draft.length} characters</span></div>
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type your message here…" rows={9} />
                  <div className="editorFooter"><span>Personalization such as <b>{'{{name}}'}</b> will be available with XLSX import.</span><button className="clearBtn" disabled={!draft} onClick={() => setDraft('')}><X size={13} /> Clear</button></div>
                </div>
                <div className="previewWrap">
                  <div className="previewHead"><span>Preview</span><span className="previewDevice"><Smartphone size={12} /> WhatsApp</span></div>
                  <div className="phonePreview">
                    <div className="previewTop"><div className="previewAvatar"><MessageSquare size={13} /></div><div><strong>Recipient</strong><span>WhatsApp</span></div></div>
                    <div className="previewBody">
                      {draft ? <div className="previewBubble"><p>{draft}</p><span>10:42 ✓✓</span></div> : <div className="previewPlaceholder">Your message preview will appear here.</div>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="sendSummary">
            <div className="summaryHead"><span>Campaign setup</span><span className="phaseTag">PHASE 1</span></div>
            <div className="summaryRow"><span>Instance</span><strong>{selectedInstance || 'Not selected'}</strong></div>
            <div className="summaryRow"><span>Message type</span><strong>Text</strong></div>
            <div className="summaryRow"><span>Recipients</span><strong className="muted">Not imported</strong></div>
            <div className="summaryDivider" />
            <div className="nextStep"><span>Next step</span><strong>Import recipients</strong><p>Upload an XLSX file of phone numbers and validate the recipient list before sending.</p></div>
            <button className="primary summaryButton" disabled>Import XLSX · Coming next</button>
          </aside>
        </div>
      )}
    </div>
  );
}
