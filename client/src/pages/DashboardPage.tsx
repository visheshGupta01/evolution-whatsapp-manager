import { useEffect, useState } from 'react';
import { BarChart3, MessageCircle, Users, Send, Bot, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { crmApi, automationApi, templatesApi, campaignJobsApi } from '../lib/api';
import { sessionsApi } from '../lib/api';
export function DashboardPage(){
 const [stats,setStats]=useState<any>(null),[sessions,setSessions]=useState<any[]>([]),[campaigns,setCampaigns]=useState<any[]>([]),[autos,setAutos]=useState<any[]>([]);
 useEffect(()=>{void Promise.all([crmApi.stats(),sessionsApi.list(),campaignJobsApi.list(6),automationApi.list()]).then(([s,se,c,a])=>{setStats(s);setSessions(se);setCampaigns(c);setAutos(a)}).catch(()=>undefined)},[]);
 const connected=sessions.filter(s=>['open','connected','online'].includes(String(s.state||s.status||'').toLowerCase())).length;
 return <div className="dashboardPage"><section className="hero"><div><p className="eyebrow">WORKSPACE</p><h1>Dashboard</h1><p>Live overview of your CRM, WhatsApp and campaign workspace.</p></div></section>
 <div className="stats">
  <div className="stat"><div className="statIcon"><Users size={16}/></div><div><span>Total leads</span><strong>{stats?.leads??'—'}</strong><small>{stats?.conversion??0}% won conversion</small></div></div>
  <div className="stat"><div className="statIcon"><MessageCircle size={16}/></div><div><span>Open conversations</span><strong>{stats?.openConversations??'—'}</strong><small>{stats?.messages??0} total messages</small></div></div>
  <div className="stat"><div className="statIcon"><Send size={16}/></div><div><span>Campaigns</span><strong>{stats?.campaigns??'—'}</strong><small>{campaigns.filter(c=>c.status==='running').length} running</small></div></div>
  <div className="stat"><div className="statIcon"><Bot size={16}/></div><div><span>Automations</span><strong>{autos.length}</strong><small>{autos.filter(a=>a.status==='active').length} active</small></div></div>
 </div>
 <div className="dashboardGrid">
  <section className="card"><div className="sectionHeading"><h2>WhatsApp sessions</h2><Link to="/sessions">Manage</Link></div><p className="dashboardLarge">{connected} connected</p><p className="muted">{sessions.length} total Evolution instances.</p></section>
  <section className="card"><div className="sectionHeading"><h2>Quick actions</h2></div><div className="quickLinks"><Link to="/leads"><Users size={15}/> Add or manage leads</Link><Link to="/inbox"><MessageCircle size={15}/> Open WhatsApp inbox</Link><Link to="/templates"><FileText size={15}/> Create template</Link><Link to="/send"><Send size={15}/> Start campaign</Link></div></section>
 </div>
 <section className="card"><div className="sectionHeading"><h2>Recent campaigns</h2><Link to="/campaigns">View all</Link></div>{campaigns.length?<div className="dashboardList">{campaigns.map(c=><div key={c.id}><strong>{c.name}</strong><span>{c.status} · {c.sent}/{c.total} sent</span></div>)}</div>:<p className="muted">No campaigns yet.</p>}</section>
 <section className="card"><div className="sectionHeading"><h2>Get started</h2></div><p className="muted">Build the workspace in the same flow as Prachar Studio: add leads, connect WhatsApp, save templates, then create campaigns and automations.</p></section>
 </div>
}