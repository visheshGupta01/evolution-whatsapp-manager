import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, CircleSlash2, Link2, MessageSquareText, Plus, RefreshCw, Search, Settings2, Smartphone, Trash2, Wifi, X, Zap } from 'lucide-react';

type Session = {
  instanceName?: string;
  status?: string;
  state?: string;
  ownerJid?: string;
  profileName?: string;
  number?: string;
  tokenKnown?: boolean;
};

type ApiResult = { message?: string; qrcode?: string; base64?: string; code?: string; qr?: string; [key: string]: unknown };
const API = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || `Request failed (${response.status})`);
  return body;
}

const stateLabel = (session: Session) => session.state || session.status || 'unknown';
const isConnected = (session: Session) => ['open', 'connected', 'online'].includes(stateLabel(session).toLowerCase());

export function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all'|'connected'|'offline'>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [qr, setQr] = useState<{ name: string; image: string } | null>(null);
  const [messageSession, setMessageSession] = useState<Session | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await request<Session[]>('/sessions');
      setSessions(data.filter(Boolean));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load sessions'); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { load(); const timer = setInterval(() => load(true), 8000); return () => clearInterval(timer); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2800); return () => clearTimeout(t); }, [toast]);

  const filtered = useMemo(() => sessions.filter((s) => {
    const name = s.instanceName || '';
    const matchesSearch = name.toLowerCase().includes(search.toLowerCase()) || String(s.number || '').includes(search);
    const matchesFilter = filter === 'all' || (filter === 'connected' ? isConnected(s) : !isConnected(s));
    return matchesSearch && matchesFilter;
  }), [sessions, search, filter]);

  const connectedCount = sessions.filter(isConnected).length;
  const connectingCount = sessions.filter(s => ['connecting','pending'].includes(stateLabel(s).toLowerCase())).length;

  const action = async (name: string, fn: () => Promise<unknown>, success: string, refresh = true) => {
    setBusy(name); setError('');
    try { await fn(); setToast(success); if (refresh) await load(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(null); }
  };

  const connect = async (session: Session) => {
    const name = session.instanceName!;
    setBusy(name); setError('');
    try {
      const data = await request<ApiResult>(`/sessions/${encodeURIComponent(name)}/connect`);
      const image = String(data.base64 || data.qrcode || data.code || data.qr || '');
      if (image.startsWith('data:image')) setQr({ name, image });
      else if (image) setToast('QR payload received. Scan it from the connection window.');
      else setToast('Connection request sent.');
      await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not connect'); }
    finally { setBusy(null); }
  };

  const createSession = async () => {
    const name = newName.trim().toLowerCase();
    if (!name) return;
    await action(`create:${name}`, async () => { await request(`/sessions`, { method: 'POST', body: JSON.stringify({ instanceName: name }) }); }, 'Session created');
    setNewName(''); setCreateOpen(false);
  };

  const remove = async (session: Session) => {
    if (!window.confirm(`Delete the WhatsApp session “${session.instanceName}”? This permanently removes the Evolution instance.`)) return;
    await action(session.instanceName!, () => request(`/sessions/${encodeURIComponent(session.instanceName!)}`, { method: 'DELETE' }), 'Session deleted');
  };

  return <div className="shell">
    <header className="topbar">
      <div className="brand"><div className="brandMark"><Zap size={18}/></div><div><strong>Evolution Manager</strong><span>Multi-session WhatsApp control</span></div></div>
      <div className="topActions"><button className="iconBtn" title="Refresh" onClick={() => load()}><RefreshCw size={18}/></button><button className="primary" onClick={() => setCreateOpen(true)}><Plus size={17}/> Add session</button></div>
    </header>

    <main>
      {error && <div className="alert"><CircleSlash2 size={17}/><span>{error}</span><button onClick={() => setError('')}><X size={16}/></button></div>}
      <section className="hero"><div><p className="eyebrow">CONTROL CENTER</p><h1>WhatsApp sessions, all in one place.</h1><p>Connect, monitor, and operate multiple Evolution API instances without exposing your global API key to the browser.</p></div><div className="heroBadge"><Wifi size={16}/><span>{connectedCount} online</span></div></section>

      <section className="stats">
        <Stat icon={<Smartphone size={18}/>} label="Total sessions" value={sessions.length} note="Evolution instances" />
        <Stat icon={<CheckCircle2 size={18}/>} label="Connected" value={connectedCount} note="Ready for messaging" />
        <Stat icon={<Activity size={18}/>} label="Connecting" value={connectingCount} note="Waiting for pairing" />
        <Stat icon={<Settings2 size={18}/>} label="Polling" value="8s" note="Automatic status refresh" />
      </section>

      <section className="toolbar"><div className="searchBox"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sessions or numbers…"/></div><div className="segmented">{(['all','connected','offline'] as const).map(key => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{key === 'all' ? 'All' : key === 'connected' ? 'Connected' : 'Offline'}</button>)}</div></section>

      {loading ? <div className="loading">Loading Evolution sessions…</div> : filtered.length === 0 ? <Empty onAdd={() => setCreateOpen(true)} hasSessions={sessions.length > 0}/> : <div className="grid">{filtered.map(session => <SessionCard key={session.instanceName} session={session} busy={busy === session.instanceName} onConnect={() => connect(session)} onRestart={() => action(session.instanceName!, () => request(`/sessions/${encodeURIComponent(session.instanceName!)}/restart`, { method: 'POST' }), 'Restart requested')} onLogout={() => action(session.instanceName!, () => request(`/sessions/${encodeURIComponent(session.instanceName!)}/disconnect`, { method: 'POST' }), 'Session logged out')} onDelete={() => remove(session)} onMessage={() => setMessageSession(session)} />)}</div>}
    </main>

    {createOpen && <Modal title="Add WhatsApp session" onClose={() => setCreateOpen(false)}><div className="form"><label>Instance name<input autoFocus value={newName} onChange={e => setNewName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase())} placeholder="sales-01"/></label><p>Use lowercase letters, numbers, hyphens, or underscores. A unique instance token is generated server-side.</p><button className="primary full" disabled={!newName.trim() || busy !== null} onClick={createSession}>{busy?.startsWith('create:') ? 'Creating…' : 'Create session'}</button></div></Modal>}
    {qr && <Modal title={`Connect ${qr.name}`} onClose={() => setQr(null)}><div className="qrWrap"><img src={qr.image} alt="WhatsApp QR code"/><strong>Scan with WhatsApp → Linked devices</strong><span>The dashboard will keep polling the session state.</span></div></Modal>}
    {messageSession && <MessageModal session={messageSession} onClose={() => setMessageSession(null)} onSent={() => { setMessageSession(null); setToast('Message sent'); }}/>} 
    {toast && <div className="toast"><CheckCircle2 size={16}/>{toast}</div>}
  </div>;
}

function Stat({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: React.ReactNode; note: string }) { return <div className="stat"><div className="statIcon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div> }
function Empty({ onAdd, hasSessions }: { onAdd: () => void; hasSessions: boolean }) { return <div className="empty"><div className="emptyIcon"><MessageSquareText size={24}/></div><h3>{hasSessions ? 'No matching sessions' : 'No WhatsApp sessions yet'}</h3><p>{hasSessions ? 'Try a different search or filter.' : 'Create your first Evolution API instance and pair it with WhatsApp.'}</p>{!hasSessions && <button className="primary" onClick={onAdd}><Plus size={16}/> Create first session</button>}</div> }

function SessionCard({ session, busy, onConnect, onRestart, onLogout, onDelete, onMessage }: { session: Session; busy: boolean; onConnect: () => void; onRestart: () => void; onLogout: () => void; onDelete: () => void; onMessage: () => void }) {
  const connected = isConnected(session); const state = stateLabel(session).toLowerCase();
  return <article className="card"><div className="cardTop"><div className="avatar"><Smartphone size={19}/></div><div className="sessionTitle"><strong>{session.instanceName || 'Unnamed'}</strong><span>{session.profileName || session.number || session.ownerJid || 'Awaiting WhatsApp pairing'}</span></div><span className={`status ${connected ? 'online' : state === 'connecting' ? 'pending' : 'offline'}`}><i/>{connected ? 'Connected' : state === 'connecting' ? 'Connecting' : state || 'Offline'}</span></div><div className="divider"/><div className="meta"><Meta label="Instance" value={session.instanceName || '—'}/><Meta label="Number" value={session.number || session.ownerJid?.split('@')[0] || '—'}/><Meta label="Token" value={session.tokenKnown ? 'Stored server-side' : 'Managed by Evolution'}/></div><div className="cardActions"><button disabled={busy} onClick={onConnect}><Link2 size={15}/>{connected ? 'View status' : 'Connect'}</button>{connected && <button disabled={busy} onClick={onMessage}><MessageSquareText size={15}/> Message</button>}<button disabled={busy} onClick={onRestart}><RefreshCw size={15}/> Restart</button><button disabled={busy} onClick={onLogout}><Wifi size={15}/> Logout</button><button className="danger" disabled={busy} onClick={onDelete}><Trash2 size={15}/></button></div></article>
}
function Meta({label,value}:{label:string;value:string}) { return <div><small>{label}</small><span>{value}</span></div> }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modalBackdrop" onMouseDown={e => { if (e.currentTarget === e.target) onClose(); }}><div className="modal"><div className="modalHead"><strong>{title}</strong><button className="iconBtn" onClick={onClose}><X size={18}/></button></div>{children}</div></div> }
function MessageModal({ session, onClose, onSent }: { session: Session; onClose: () => void; onSent: () => void }) { const [number, setNumber] = useState(''); const [text, setText] = useState('Hello from Evolution Manager 👋'); const [sending,setSending]=useState(false); const [error,setError]=useState(''); const send=async()=>{setSending(true);setError('');try{await request(`/sessions/${encodeURIComponent(session.instanceName!)}/send-text`,{method:'POST',body:JSON.stringify({number,text})});onSent();}catch(e){setError(e instanceof Error?e.message:'Could not send message');}finally{setSending(false)}}; return <Modal title={`Send from ${session.instanceName}`} onClose={onClose}><div className="form"><label>Recipient number<input value={number} onChange={e=>setNumber(e.target.value)} placeholder="919876543210"/></label><label>Message<textarea rows={5} value={text} onChange={e=>setText(e.target.value)}/></label>{error&&<div className="fieldError">{error}</div>}<button className="primary full" disabled={!number.trim()||!text.trim()||sending} onClick={send}>{sending?'Sending…':'Send message'}</button></div></Modal> }
