import { useMemo, useState } from 'react';
import { Building2, ContactRound, RefreshCw, Search, Users, UserRound } from 'lucide-react';
import { useSessions } from '../hooks/use-sessions';
import { useContacts } from '../hooks/use-contacts';
import { useAppStore } from '../stores/app-store';
import '../styles/contacts.css';

function displayNumber(contact: { number: string; remoteJid: string }) {
  if (contact.number) return contact.number;
  return contact.remoteJid.split('@')[0].replace(/:.*$/, '');
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join('') || '?').toUpperCase();
}

export function ContactsPage() {
  const { data: sessions = [] } = useSessions();
  const selectedInstance = useAppStore((state) => state.selectedInstance);
  const setSelectedInstance = useAppStore((state) => state.setSelectedInstance);
  const instance = selectedInstance || sessions.find((session) => session.instanceName)?.instanceName || null;
  const contacts = useContacts(instance);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'saved' | 'business' | 'groups'>('all');

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (contacts.data || []).filter((contact) => {
      if (filter === 'saved' && !contact.isSaved) return false;
      if (filter === 'business' && !contact.isBusiness) return false;
      if (filter === 'groups' && !contact.isGroup) return false;
      if (!needle) return true;
      return [contact.name, contact.pushName, contact.number, contact.remoteJid]
        .some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [contacts.data, filter, search]);

  return (
    <div className="contactsPage">
      <section className="hero contactsHero">
        <div>
          <p className="eyebrow">WHATSAPP</p>
          <h1>Contacts</h1>
          <p>Browse contacts stored by your connected Evolution API instance.</p>
        </div>
        <div className="contactsHeroActions">
          <select value={instance || ''} onChange={(event) => setSelectedInstance(event.target.value || null)} aria-label="Select WhatsApp instance">
            {!sessions.length && <option value="">No sessions</option>}
            {sessions.map((session) => <option key={session.instanceName} value={session.instanceName}>{session.profileName || session.instanceName}</option>)}
          </select>
          <button className="iconBtn" onClick={() => void contacts.refetch()} disabled={!instance || contacts.isFetching} aria-label="Refresh contacts" title="Refresh contacts">
            <RefreshCw size={17} className={contacts.isFetching ? 'spin' : ''} />
          </button>
        </div>
      </section>

      <section className="contactsToolbar">
        <div className="searchBox contactsSearch"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or phone number…" /></div>
        <div className="contactFilters" role="tablist" aria-label="Contact filters">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}><ContactRound size={15} /> All</button>
          <button className={filter === 'saved' ? 'active' : ''} onClick={() => setFilter('saved')}><UserRound size={15} /> Saved</button>
          <button className={filter === 'business' ? 'active' : ''} onClick={() => setFilter('business')}><Building2 size={15} /> Business</button>
          <button className={filter === 'groups' ? 'active' : ''} onClick={() => setFilter('groups')}><Users size={15} /> Groups</button>
        </div>
      </section>

      {!instance ? (
        <div className="contactsEmpty"><ContactRound size={34} /><h3>Select a WhatsApp session</h3><p>Connect an Evolution API instance to load its contacts.</p></div>
      ) : contacts.isLoading ? (
        <div className="contactsGrid">{Array.from({ length: 8 }).map((_, index) => <div className="contactCard contactSkeleton" key={index} />)}</div>
      ) : contacts.isError ? (
        <div className="contactsEmpty"><ContactRound size={34} /><h3>Couldn’t load contacts</h3><p>{contacts.error instanceof Error ? contacts.error.message : 'Evolution API returned an error.'}</p><button className="primary" onClick={() => void contacts.refetch()}>Try again</button></div>
      ) : filtered.length ? (
        <div className="contactsGrid">
          {filtered.map((contact) => (
            <article className="contactCard" key={contact.id}>
              <div className="contactAvatar">
                {contact.profilePicUrl ? <img src={contact.profilePicUrl} alt="" loading="lazy" /> : contact.isGroup ? <Users size={22} /> : initials(contact.name)}
              </div>
              <div className="contactBody">
                <div className="contactNameRow"><h3>{contact.name}</h3>{contact.isBusiness && <span className="contactBadge">Business</span>}</div>
                <p className="contactNumber">+{displayNumber(contact)}</p>
                <div className="contactMeta">
                  {contact.isSaved && <span>Saved</span>}
                  {contact.isGroup && <span>Group</span>}
                  {!contact.isSaved && !contact.isGroup && <span>WhatsApp contact</span>}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="contactsEmpty"><Search size={34} /><h3>No contacts found</h3><p>Try another search or filter.</p></div>
      )}
      {contacts.data && <div className="contactsFooter">Showing {filtered.length} of {contacts.data.length} contacts</div>}
    </div>
  );
}
