import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCheck, MessageCircle, RefreshCw, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useSessions } from '../hooks/use-sessions';
import { useChats, useMessages, useSendMessage } from '../hooks/use-chats';
import { useAppStore } from '../stores/app-store';

function isOnline(session: any) {
  return ['open', 'connected', 'online'].includes(String(session?.state || session?.status || '').toLowerCase());
}
function formatTime(value: string | number | null) {
  if (!value) return '';
  const date = new Date(typeof value === 'number' && value < 10_000_000_000 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function displayNumber(jid: string) { return jid.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, ''); }

export function MessagesPage() {
  const { data: sessions = [] } = useSessions();
  const selectedInstance = useAppStore((state) => state.selectedInstance);
  const setSelectedInstance = useAppStore((state) => state.setSelectedInstance);
  const connected = useMemo(() => sessions.filter(isOnline), [sessions]);
  const instance = connected.some((item) => item.instanceName === selectedInstance) ? selectedInstance : connected[0]?.instanceName || null;
  const [search, setSearch] = useState('');
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [mobileThread, setMobileThread] = useState(false);
  const chats = useChats(instance);
  const messages = useMessages(instance, selectedJid);
  const send = useSendMessage();

  useEffect(() => { if (instance && instance !== selectedInstance) setSelectedInstance(instance); }, [instance, selectedInstance, setSelectedInstance]);
  useEffect(() => {
    if (!selectedJid && chats.data?.length) setSelectedJid(chats.data[0].remoteJid);
    if (selectedJid && chats.data && !chats.data.some((chat) => chat.remoteJid === selectedJid)) setSelectedJid(chats.data[0]?.remoteJid || null);
  }, [chats.data, selectedJid]);

  const filteredChats = (chats.data || []).filter((chat) => {
    const q = search.trim().toLowerCase();
    return !q || chat.name.toLowerCase().includes(q) || chat.remoteJid.toLowerCase().includes(q) || chat.lastMessage.toLowerCase().includes(q);
  });
  const selectedChat = chats.data?.find((chat) => chat.remoteJid === selectedJid) || null;

  const submit = async () => {
    const text = draft.trim();
    if (!instance || !selectedJid || !text || send.isPending) return;
    try { await send.mutateAsync({ instance, remoteJid: selectedJid, text }); setDraft(''); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not send message'); }
  };

  if (!connected.length) return <section className="empty messageEmpty"><MessageCircle size={30}/><h3>No connected WhatsApp session</h3><p>Pair a session first, then your conversations will appear here.</p></section>;

  return <>
    <section className="hero messagesHero">
      <div><p className="eyebrow">COMMUNICATIONS</p><h1>Inbox</h1><p>Live conversations from your connected WhatsApp sessions.</p></div>
      <label className="instanceSelect"><span>Session</span><select value={instance || ''} onChange={(e) => { setSelectedInstance(e.target.value); setSelectedJid(null); }}><option value="" disabled>Select session</option>{connected.map((item) => <option key={item.instanceName} value={item.instanceName}>{item.instanceName}</option>)}</select></label>
    </section>
    <div className={`inbox ${mobileThread ? 'threadOpen' : ''}`}>
      <aside className="chatList">
        <div className="chatListHead"><strong>Conversations</strong><button className="iconBtn small" onClick={() => void chats.refetch()} aria-label="Refresh chats"><RefreshCw size={14}/></button></div>
        <div className="searchBox chatSearch"><Search size={15}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats…"/></div>
        <div className="chatRows">
          {chats.isLoading ? <div className="chatState">Loading conversations…</div> : chats.isError ? <div className="chatState">Could not load chats.<button className="secondary" onClick={() => void chats.refetch()}>Retry</button></div> : filteredChats.length ? filteredChats.map((chat) => <button className={`chatRow ${chat.remoteJid === selectedJid ? 'selected' : ''}`} key={chat.remoteJid} onClick={() => { setSelectedJid(chat.remoteJid); setMobileThread(true); }}><div className="chatAvatar"><MessageCircle size={16}/></div><div className="chatRowBody"><div><strong>{chat.name}</strong><time>{formatTime(chat.timestamp)}</time></div><p>{chat.lastMessage || displayNumber(chat.remoteJid)}</p></div>{chat.unreadCount > 0 && <b className="unread">{chat.unreadCount}</b>}</button>) : <div className="chatState">No conversations found.</div>}
        </div>
      </aside>
      <section className="thread">
        {selectedChat ? <>
          <header className="threadHead"><button className="iconBtn backBtn" onClick={() => setMobileThread(false)} aria-label="Back to conversations"><ArrowLeft size={16}/></button><div className="chatAvatar"><MessageCircle size={16}/></div><div><strong>{selectedChat.name}</strong><span>{displayNumber(selectedChat.remoteJid)}</span></div><span className="threadLive"><i/>Live</span></header>
          <div className="messageList">
            {messages.isLoading ? <div className="chatState">Loading messages…</div> : messages.isError ? <div className="chatState">Could not load message history.<button className="secondary" onClick={() => void messages.refetch()}>Retry</button></div> : messages.data?.length ? messages.data.map((message) => <div className={`bubbleRow ${message.fromMe ? 'mine' : ''}`} key={message.id}><div className="bubble"><p>{message.text || `[${message.messageType}]`}</p><span>{formatTime(message.timestamp)} {message.fromMe && <CheckCheck size={12}/>}</span></div></div>) : <div className="threadEmpty"><MessageCircle size={26}/><strong>No messages yet</strong><span>Send the first message in this conversation.</span></div>}
          </div>
          <div className="composer"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }} placeholder="Type a message…" rows={1}/><button className="primary" disabled={!draft.trim() || send.isPending} onClick={() => void submit()} aria-label="Send message"><Send size={16}/>{send.isPending ? 'Sending…' : 'Send'}</button></div>
        </> : <div className="threadEmpty"><MessageCircle size={32}/><strong>Select a conversation</strong><span>Choose a chat from the left to view its history.</span></div>}
      </section>
    </div>
  </>;
}
