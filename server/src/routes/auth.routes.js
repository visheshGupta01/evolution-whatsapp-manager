import crypto from 'node:crypto';
import { Router } from 'express';
import { pool } from '../services/db.js';

export const authRouter=Router();
const sessions=new Map();
const hash=(v)=>crypto.createHash('sha256').update(String(v)).digest('hex');
const makeToken=()=>crypto.randomBytes(32).toString('hex');
const defaults={dashboard:true,leadsView:true,leadsEdit:false,inboxReply:true,inboxAssign:false,templatesUse:true,templatesManage:false,campaigns:false,automations:false,analytics:false,settings:false};
const makeId=(p)=>p+'_'+Date.now().toString(36)+'_'+crypto.randomBytes(5).toString('hex');

export async function authUser(req,res,next){
  try{
    const raw=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
    if(!raw)return res.status(401).json({ok:false,message:'Authentication required.'});
    const r=await pool.query(`SELECT u.id,u.email,u.role,u.status,u.member_id,m.name,m.permissions
      FROM auth_sessions s JOIN app_users u ON u.id=s.user_id LEFT JOIN members m ON m.id=u.member_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW() LIMIT 1`,[hash(raw)]);
    if(!r.rows[0]||r.rows[0].status!=='active')return res.status(401).json({ok:false,message:'Session expired.'});
    req.user=r.rows[0]; next();
  }catch(e){next(e);}
}

authRouter.get('/me',authUser,(req,res)=>res.json({id:req.user.id,email:req.user.email,role:req.user.role,memberId:req.user.member_id,name:req.user.name||'Owner',permissions:req.user.permissions||defaults}));

authRouter.post('/setup',async(req,res,next)=>{
 try{
   const count=await pool.query('SELECT COUNT(*)::int count FROM app_users');
   if(Number(count.rows[0].count)>0)return res.status(409).json({ok:false,message:'Owner account is already configured.'});
   const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
   if(!email||!password||password.length<8)return res.status(400).json({ok:false,message:'Email and a password of at least 8 characters are required.'});
   const id=makeId('user'); const now=new Date();
   await pool.query('INSERT INTO app_users(id,email,password_hash,role) VALUES($1,$2,$3,$4)',[id,email,hash(password),'owner']);
   await pool.query(`INSERT INTO workspace_settings(key,value) VALUES
      ('workspaceName','Prachar Studio'),('ownerName',''),('ownerEmail',$1),('timezone','Asia/Kolkata'),
      ('whatsappNumber',''),('notifyNewLead','true'),('notifyNewMessage','true')
      ON CONFLICT(key) DO NOTHING`,[email]);
   const token=makeToken();await pool.query(`INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '30 days')`,[makeId('sess'),id,hash(token)]);
   res.status(201).json({token,user:{id,email,role:'owner',memberId:null,name:'Owner',permissions:{...defaults}}});
 }catch(e){next(e);}
});

authRouter.post('/login',async(req,res,next)=>{
 try{
  const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');
  const r=await pool.query(`SELECT u.id,u.email,u.role,u.status,u.member_id,m.name,m.permissions FROM app_users u
    LEFT JOIN members m ON m.id=u.member_id WHERE lower(u.email)=lower($1) LIMIT 1`,[email]);
  if(!r.rows[0]||r.rows[0].password_hash!==hash(password)||r.rows[0].status!=='active')return res.status(401).json({ok:false,message:'Invalid email or password.'});
  const u=r.rows[0],token=makeToken();await pool.query(`INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '30 days')`,[makeId('sess'),u.id,hash(token)]);
  res.json({token,user:{id:u.id,email:u.email,role:u.role,memberId:u.member_id,name:u.name||'Owner',permissions:u.permissions||defaults}});
 }catch(e){next(e);}
});

authRouter.post('/logout',authUser,async(req,res,next)=>{
 try{const raw=String(req.headers.authorization||'').replace(/^Bearers+/i,'').trim();await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[hash(raw)]);res.status(204).end();}catch(e){next(e);}
});

export function requireOwner(req,res,next){if(req.user?.role!=='owner')return res.status(403).json({ok:false,message:'Owner access required.'});next();}
export function requirePermission(key){return(req,res,next)=>{if(req.user?.role==='owner')return next();if(req.user?.status!=='active'||!req.user?.permissions?.[key])return res.status(403).json({ok:false,message:'Permission denied.'});next();};}
