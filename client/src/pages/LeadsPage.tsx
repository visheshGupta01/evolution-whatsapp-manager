import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Plus, Search, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { crmApi, type Lead, type LeadStatus } from '../lib/api';
import '../styles/crm.css';

const statuses: LeadStatus[] = ['new','contacted','qualified','won','lost'];
const sources = ['WhatsApp','Website','Referral','Instagram','Google Ads','Walk-in','Other'];

export function LeadsPage(){
 const [leads,setLeads]=useState<Lead[]>([]),[loading,setLoading]=useState(true),[query,setQuery]=useState(''),[status,setStatus]=useState<LeadStatus|'all'>('all'),[open,setOpen]=useState(false);
 const load=async()=>{setLoading(true);try{setLeads(await crmApi.listLeads())}catch(e){toast.error(e instanceof Error?e.message:'Could not load leads.')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const filtered=useMemo(()=>leads.filter(l=>{const q=query.toLowerCase();return (!q||[l.name,l.phone,l.email,l.company,...l.tags].join(' ').toLowerCase().includes(q))&&(status==='all'||l.status===status)}),[leads,query,status]);
 return <div className="crmPage">
  <section className="hero"><div><p className="eyebrow">CRM</p><h1>Leads</h1><p>Capture, search and track every lead that powers your WhatsApp workflows.</p></div><button className="primary" onClick={()=>setOpen(true)}><Plus size={15}/> New lead</button></section>
  <section className="toolbar"><div className="searchBox"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, phone, company or tag"/></div><div className="segmented">{['all',...statuses].map(s=><button key={s} className={status===s?'active':''} onClick={()=>setStatus(s as LeadStatus|'all')}>{s}</button>)}</div></section>
  {loading?<div className="loading">Loading leads…</div>:!filtered.length?<div className="empty"><UserRound size={24}/><h3>{leads.length?'No matching leads':'No leads yet'}</h3><p>{leads.length?'Try another search or status filter.':'Create your first lead to power campaigns and the inbox.'}</p>{!leads.length&&<button className="primary" onClick={()=>setOpen(true)}>Create lead</button>}</div>:<div className="grid">{filtered.map(l=><Link className="card leadCard" key={l.id} to={`/leads/${l.id}`}><div className="cardTop"><div className="avatar"><UserRound size={16}/></div><div className="sessionTitle"><strong>{l.name}</strong><span>{l.company||l.phone||'No contact details'}</span></div><span className={`status ${l.status}`}>{l.status}</span></div><div className="divider"/><div className="leadMeta"><span>{l.source}</span><span>{l.email||'No email'}</span><span>{l.assignedTo||'Unassigned'}</span></div>{l.tags.length>0&&<div className="tagRow">{l.tags.map(t=><span key={t}>{t}</span>)}</div>}</Link>)}</div>}
  {open&&<LeadEditor close={()=>setOpen(false)} saved={()=>{setOpen(false);void load()}}/>}
 </div>;
}

function LeadEditor({close,saved}:{close:()=>void;saved:()=>void}){
 const [name,setName]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[company,setCompany]=useState(''),[source,setSource]=useState('WhatsApp'),[status,setStatus]=useState<LeadStatus>('new'),[tags,setTags]=useState(''),[assignedTo,setAssignedTo]=useState(''),[notes,setNotes]=useState(''),[busy,setBusy]=useState(false);
 const save=async()=>{if(!name.trim())return toast.error('Lead name is required.');setBusy(true);try{await crmApi.createLead({name,phone,email,company,source,status,tags:tags.split(',').map(x=>x.trim()).filter(Boolean),assignedTo:assignedTo||null,notes});toast.success('Lead created');saved()}catch(e){toast.error(e instanceof Error?e.message:'Could not create lead.')}finally{setBusy(false)}};
 return <div className="modalBackdrop"><section className="modal wide"><div className="modalHead"><strong>New lead</strong><button className="iconBtn" onClick={close}>×</button></div><div className="form two"><label>Name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>WhatsApp number<input value={phone} onChange={e=>setPhone(e.target.value)}/></label><label>Email<input value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Company<input value={company} onChange={e=>setCompany(e.target.value)}/></label><label>Source<select value={source} onChange={e=>setSource(e.target.value)}>{sources.map(x=><option key={x}>{x}</option>)}</select></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value as LeadStatus)}>{statuses.map(x=><option key={x}>{x}</option>)}</select></label><label>Tags<input value={tags} onChange={e=>setTags(e.target.value)} placeholder="premium, delhi"/></label><label>Assigned to<input value={assignedTo} onChange={e=>setAssignedTo(e.target.value)} placeholder="member id or owner"/></label><label className="span2">Notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={4}/></label></div><div className="cardActions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" onClick={()=>void save()} disabled={busy}>{busy?'Saving…':'Create lead'}</button></div></section></div>;
}
