import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from '@keep-lts/xlsx';
import { Database, Download, Loader2, Pencil, Plus, Search, Trash2, Upload, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { audiencesApi, type Audience, type CampaignRecipient } from '../lib/api';
import '../styles/audiences.css';

type RecipientRow = CampaignRecipient & { row:number; valid:boolean; error?:string };
const MAX_RECIPIENTS=2500;
const PHONE_HEADERS=['phone','number','mobile','mobilenumber','whatsapp','whatsappnumber','contact','phonenumber'];
const normalizeHeader=(v:unknown)=>String(v??'').trim().toLowerCase().replace(/[\\s_-]+/g,'');
const normalizePhone=(v:unknown)=>String(v??'').trim().replace(/[^0-9]/g,'');
function parseSheet(data:ArrayBuffer):RecipientRow[]{
 const wb=XLSX.read(data,{type:'array'}); const sheet=wb.Sheets[wb.SheetNames[0]]; if(!sheet)throw new Error('The workbook does not contain a sheet.');
 const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:''}); if(!rows.length)throw new Error('The spreadsheet is empty.');
 const map=new Map<string,string>(); Object.keys(rows[0]).forEach(k=>map.set(normalizeHeader(k),k)); const phoneHeader=PHONE_HEADERS.find(k=>map.has(k)); if(!phoneHeader)throw new Error('A phone column is required.');
 const phoneKey=map.get(phoneHeader)!; const seen=new Set<string>(); const get=(r:Record<string,unknown>,k:string)=>{const key=map.get(k);return key?String(r[key]??'').trim():''};
 return rows.map((r,i)=>{const phone=normalizePhone(r[phoneKey]);let error='';if(!phone)error='Missing phone';else if(phone.length<8||phone.length>15)error='Phone must contain 8–15 digits';else if(seen.has(phone))error='Duplicate phone';else seen.add(phone);return {row:i+2,phone,name:get(r,'name')||undefined,company:get(r,'company')||undefined,custom1:get(r,'custom1')||undefined,custom2:get(r,'custom2')||undefined,valid:!error,error:error||undefined}});
}
const clean=(rows:RecipientRow[]):CampaignRecipient[]=>rows.filter(r=>r.valid).map(({row:_r,valid:_v,error:_e,...r})=>r);
function downloadTemplate(){const ws=XLSX.utils.json_to_sheet([{phone:'919876543210',name:'Rahul',company:'Acme',custom1:'Premium',custom2:'Delhi'}]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Recipients');XLSX.writeFile(wb,'audience-template.xlsx')}

export function AudiencesPage(){
 const [audiences,setAudiences]=useState<Awaited<ReturnType<typeof audiencesApi.list>>>([]); const [loading,setLoading]=useState(true); const [search,setSearch]=useState('');
 const [selected,setSelected]=useState<Audience|null>(null); const [name,setName]=useState(''); const [description,setDescription]=useState(''); const [rows,setRows]=useState<RecipientRow[]>([]); const [fileName,setFileName]=useState(''); const [busy,setBusy]=useState(false); const inputRef=useRef<HTMLInputElement>(null);
 const load=async()=>{setLoading(true);try{setAudiences(await audiencesApi.list())}catch(e){toast.error(e instanceof Error?e.message:'Could not load audiences.')}finally{setLoading(false)}}; useEffect(()=>{void load()},[]);
 const filtered=useMemo(()=>audiences.filter(a=>(a.name+' '+a.description).toLowerCase().includes(search.toLowerCase())),[audiences,search]);
 const close=()=>{setSelected(null);setName('');setDescription('');setRows([]);setFileName('')};
 const create=()=>{close();};
 const edit=async(id:string)=>{setBusy(true);try{const a=await audiencesApi.get(id);setSelected(a);setName(a.name);setDescription(a.description);setRows(a.recipients.map((r,i)=>({...r,row:i+1,valid:true})));setFileName('Saved audience')}catch(e){toast.error(e instanceof Error?e.message:'Could not load audience.')}finally{setBusy(false)}};
 const importFile=async(e:ChangeEvent<HTMLInputElement>)=>{const f=e.target.files?.[0];e.target.value='';if(!f)return;try{const parsed=parseSheet(await f.arrayBuffer());if(parsed.length>MAX_RECIPIENTS)throw new Error('Maximum '+MAX_RECIPIENTS+' spreadsheet rows.');setRows(parsed);setFileName(f.name);toast.success('Imported '+parsed.length+' rows')}catch(err){toast.error(err instanceof Error?err.message:'Could not read spreadsheet.')}};
 const save=async()=>{const recipients=clean(rows);if(!name.trim())return toast.error('Audience name is required.');if(!recipients.length)return toast.error('Import at least one valid recipient.');setBusy(true);try{if(selected)await audiencesApi.update(selected.id,name,description,recipients);else await audiencesApi.create(name,description,recipients);toast.success(selected?'Audience updated':'Audience created');close();await load()}catch(e){toast.error(e instanceof Error?e.message:'Could not save audience.')}finally{setBusy(false)}};
 const remove=async(id:string)=>{if(!window.confirm('Delete this audience?'))return;setBusy(true);try{await audiencesApi.remove(id);toast.success('Audience deleted');await load()}catch(e){toast.error(e instanceof Error?e.message:'Could not delete audience.')}finally{setBusy(false)}};
 return <div className='audiencesPage'>
  <section className='hero audiencesHero'><div><p className='eyebrow'>AUDIENCES</p><h1>Audience Management</h1><p>Save recipient lists once and reuse them across campaigns.</p></div><button className='primary' onClick={create}><Plus size={15}/> New audience</button></section>
  <div className='audienceToolbar'><div className='audienceSearch'><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder='Search audiences…'/></div></div>
  {loading?<div className='audienceEmpty'><Loader2 size={18} className='spin'/> Loading audiences…</div>:!filtered.length?<div className='audienceEmpty'><Users size={24}/><strong>No audiences yet</strong><span>Create an audience from an XLSX/CSV recipient list.</span></div>:<div className='audienceGrid'>{filtered.map(a=><article className='audienceCard' key={a.id}><div className='audienceCardHead'><div className='audienceIcon'><Users size={17}/></div><div><strong>{a.name}</strong><span>{a.description||'No description'}</span></div></div><div className='audienceStats'><b>{a.total}</b><span>recipients</span></div><div className='audienceActions'><button className='secondary' onClick={()=>void edit(a.id)}><Pencil size={12}/> Edit</button><button className='dangerButton' onClick={()=>void remove(a.id)}><Trash2 size={12}/></button></div></article>)}</div>}
  {(name||selected)&&<div className='audienceBackdrop'><section className='audienceEditor'><header><div><p className='eyebrow'>{selected?'EDIT AUDIENCE':'NEW AUDIENCE'}</p><h2>{selected?'Edit audience':'Create audience'}</h2></div><button className='closeBtn' onClick={close}><X size={18}/></button></header>
   <div className='audienceForm'><label>Name<input value={name} onChange={e=>setName(e.target.value)} placeholder='Customers — Delhi'/></label><label>Description<textarea value={description} onChange={e=>setDescription(e.target.value)} rows={2}/></label><input ref={inputRef} hidden type='file' accept='.xlsx,.xls,.csv' onChange={importFile}/><div className='audienceUpload'><button className='uploadDrop' onClick={()=>inputRef.current?.click()}><Upload size={17}/><span><strong>{fileName||'Upload recipient list'}</strong><small>XLSX, XLS or CSV · up to {MAX_RECIPIENTS} rows</small></span></button><button className='secondary' onClick={downloadTemplate}><Download size={13}/> Template</button></div>
   {!!rows.length&&<><div className='audienceCounts'><span>{rows.length} rows</span><b>{rows.filter(r=>r.valid).length} valid</b><em>{rows.filter(r=>!r.valid).length} invalid</em></div><div className='audienceTableWrap'><table><thead><tr><th>Row</th><th>Phone</th><th>Name</th><th>Company</th><th>Status</th></tr></thead><tbody>{rows.slice(0,12).map(r=><tr key={r.row}><td>{r.row}</td><td>{r.phone||'—'}</td><td>{r.name||'—'}</td><td>{r.company||'—'}</td><td className={r.valid?'valid':'invalid'}>{r.valid?'Valid':r.error}</td></tr>)}</tbody></table>{rows.length>12&&<small>Showing first 12 rows. All valid rows will be saved.</small>}</div></>}</div>
   <footer><button className='secondary' onClick={close}>Cancel</button><button className='primary' disabled={busy} onClick={()=>void save()}>{busy?<Loader2 size={14} className='spin'/>:<Database size={14}/>} {selected?'Save changes':'Create audience'}</button></footer>
  </section></div>}
 </div>
}