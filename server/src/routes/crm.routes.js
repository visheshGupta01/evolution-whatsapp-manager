import { Router } from 'express';
import { pool } from '../services/db.js';
import crypto from 'node:crypto';

export const crmRouter = Router();
const makeId = (prefix) => prefix + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(5).toString('hex');
const clean = (v) => String(v ?? '').trim();
const statuses = new Set(['new','contacted','qualified','won','lost']);

crmRouter.get('/leads', async (_req,res,next) => {
  try {
    const { rows } = await pool.query(`SELECT l.*,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'at',a.created_at,'text',a.text) ORDER BY a.created_at DESC)
                FROM lead_activity a WHERE a.lead_id=l.id),'[]'::jsonb) activity
      FROM leads l ORDER BY l.created_at DESC`);
    res.json(rows.map(r=>({id:r.id,name:r.name,phone:r.phone,email:r.email,company:r.company,source:r.source,status:r.status,tags:r.tags||[],assignedTo:r.assigned_to,notes:r.notes,createdAt:r.created_at,activity:r.activity||[]})));
  } catch(e){ next(e); }
});

crmRouter.get('/leads/:id', async (req,res,next)=>{
  try {
    const r=await pool.query('SELECT * FROM leads WHERE id=$1',[req.params.id]);
    if(!r.rows[0]) return res.status(404).json({ok:false,message:'Lead not found.'});
    const a=await pool.query('SELECT id,created_at AS at,text FROM lead_activity WHERE lead_id=$1 ORDER BY created_at DESC',[req.params.id]);
    const x=r.rows[0];
    res.json({id:x.id,name:x.name,phone:x.phone,email:x.email,company:x.company,source:x.source,status:x.status,tags:x.tags||[],assignedTo:x.assigned_to,notes:x.notes,createdAt:x.created_at,activity:a.rows});
  } catch(e){next(e);}
});

crmRouter.post('/leads', async(req,res,next)=>{
  try {
    const b=req.body||{}, name=clean(b.name);
    if(!name) return res.status(400).json({ok:false,message:'Lead name is required.'});
    const lead={id:makeId('lead'),name,phone:clean(b.phone),email:clean(b.email),company:clean(b.company),source:clean(b.source)||'Other',status:statuses.has(b.status)?b.status:'new',tags:Array.isArray(b.tags)?b.tags.map(clean).filter(Boolean):[],assignedTo:b.assignedTo||null,notes:clean(b.notes)};
    const createdAt=new Date().toISOString();
    await pool.query(`INSERT INTO leads(id,name,phone,email,company,source,status,tags,assigned_to,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,[lead.id,lead.name,lead.phone,lead.email,lead.company,lead.source,lead.status,JSON.stringify(lead.tags),lead.assignedTo,lead.notes]);
    await pool.query('INSERT INTO lead_activity(id,lead_id,text) VALUES($1,$2,$3)',[makeId('act'),lead.id,'Lead created']);
    res.status(201).json({...lead,createdAt,activity:[{id:makeId('act'),at:createdAt,text:'Lead created'}]});
  } catch(e){next(e);}
});

crmRouter.put('/leads/:id', async(req,res,next)=>{
  try {
    const current=await pool.query('SELECT * FROM leads WHERE id=$1',[req.params.id]);
    if(!current.rows[0]) return res.status(404).json({ok:false,message:'Lead not found.'});
    const c=current.rows[0],b=req.body||{};
    const next={
      name:b.name!==undefined?clean(b.name):c.name,
      phone:b.phone!==undefined?clean(b.phone):c.phone,
      email:b.email!==undefined?clean(b.email):c.email,
      company:b.company!==undefined?clean(b.company):c.company,
      source:b.source!==undefined?(clean(b.source)||'Other'):c.source,
      status:b.status!==undefined&&statuses.has(b.status)?b.status:c.status,
      tags:Array.isArray(b.tags)?b.tags.map(clean).filter(Boolean):(c.tags||[]),
      assignedTo:b.assignedTo!==undefined?(b.assignedTo||null):c.assigned_to,
      notes:b.notes!==undefined?clean(b.notes):c.notes
    };
    await pool.query(`UPDATE leads SET name=$2,phone=$3,email=$4,company=$5,source=$6,status=$7,tags=$8::jsonb,assigned_to=$9,notes=$10,updated_at=NOW() WHERE id=$1`,[req.params.id,next.name,next.phone,next.email,next.company,next.source,next.status,JSON.stringify(next.tags),next.assignedTo,next.notes]);
    if(clean(b.activityText)) await pool.query('INSERT INTO lead_activity(id,lead_id,text) VALUES($1,$2,$3)',[makeId('act'),req.params.id,clean(b.activityText)]);
    res.json({...next,id:req.params.id,createdAt:c.created_at});
  } catch(e){next(e);}
});

crmRouter.delete('/leads/:id',async(req,res,next)=>{
  try { const r=await pool.query('DELETE FROM leads WHERE id=$1',[req.params.id]); if(!r.rowCount)return res.status(404).json({ok:false,message:'Lead not found.'}); res.status(204).end(); } catch(e){next(e);}
});

crmRouter.get('/stats',async(_req,res,next)=>{
  try{
    const [l,c,m,ca]=await Promise.all([
      pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='won')::int won FROM leads`),
      pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='open')::int open FROM conversations`),
      pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE direction='out')::int outbound FROM messages`),
      pool.query('SELECT COUNT(*)::int total FROM campaigns')
    ]);
    const leads=Number(l.rows[0].total),won=Number(l.rows[0].won);
    res.json({leads,won,conversion:leads?Number((won/leads*100).toFixed(1)):0,conversations:Number(c.rows[0].total),openConversations:Number(c.rows[0].open),messages:Number(m.rows[0].total),outboundMessages:Number(m.rows[0].outbound),campaigns:Number(ca.rows[0].total)});
  }catch(e){next(e);}
});
