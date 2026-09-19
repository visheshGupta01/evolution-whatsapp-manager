import { Router } from 'express';
import { findChats, findMessages, markMessageAsRead, sendReaction, sendPresence, archiveChat, deleteMessageForEveryone, updateMessage, sendText, sendMedia } from '../services/evolution.service.js';
import { pool } from '../services/db.js';

export const inboxRouter = Router();

const clean=(v)=>String(v??'').trim();
const id=(p)=>p+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);

function normalizeChat(raw, instance){
  const remoteJid=raw?.remoteJid||raw?.id||raw?.jid||raw?.contact?.id;
  const last=raw?.lastMessage?.message||raw?.lastMessage||raw?.messages?.[raw.messages.length-1];
  const text=last?.conversation||last?.extendedTextMessage?.text||raw?.lastMessage?.message?.conversation||raw?.lastMessage?.message?.extendedTextMessage?.text||raw?.lastMessage?.text||'';
  return { ...raw, instance, remoteJid, name:raw?.name||raw?.pushName||raw?.contact?.name||raw?.contact?.pushName||remoteJid?.split('@')[0], unreadCount:Number(raw?.unreadCount||raw?.unreadMessages||0), lastText:text };
}

inboxRouter.get('/chats/:instance',async(req,res,next)=>{
  try{
    const data=await findChats(req.params.instance);
    const chats=data.map((x)=>normalizeChat(x,req.params.instance)).filter(x=>x.remoteJid);
    for(const chat of chats){
      await pool.query(`INSERT INTO conversations(id,instance,remote_jid,status,unread_count,updated_at)
        VALUES($1,$2,$3,'open',$4,NOW()) ON CONFLICT(instance,remote_jid)
        DO UPDATE SET unread_count=EXCLUDED.unread_count,updated_at=NOW()`,[id('conv'),req.params.instance,chat.remoteJid,chat.unreadCount]).catch(()=>undefined);
    }
    res.json(chats);
  }catch(e){next(e);}
});

inboxRouter.get('/chats/:instance/messages',async(req,res,next)=>{
  try{
    const remoteJid=clean(req.query.remoteJid); if(!remoteJid)return res.status(400).json({ok:false,message:'remoteJid is required.'});
    const data=await findMessages(req.params.instance,remoteJid,req.query.page,req.query.offset);
    res.json(data);
  }catch(e){next(e);}
});

inboxRouter.post('/chats/:instance/send-text',async(req,res,next)=>{
  try{
    const result=await sendText(req.params.instance,req.body?.number,req.body?.text,{linkPreview:Boolean(req.body?.linkPreview)});
    res.json(result);
  }catch(e){next(e);}
});

inboxRouter.post('/chats/:instance/send-media',async(req,res,next)=>{
  try{
    res.json(await sendMedia(req.params.instance,req.body?.number,req.body?.media,{caption:req.body?.caption||'',delayMs:0}));
  }catch(e){next(e);}
});

inboxRouter.post('/chats/:instance/read',async(req,res,next)=>{
  try{res.json(await markMessageAsRead(req.params.instance,Array.isArray(req.body?.readMessages)?req.body.readMessages:[]));}catch(e){next(e);}
});
inboxRouter.post('/chats/:instance/reaction',async(req,res,next)=>{
  try{res.json(await sendReaction(req.params.instance,req.body?.remoteJid,req.body?.messageId,Boolean(req.body?.fromMe),req.body?.reaction||''));}catch(e){next(e);}
});
inboxRouter.post('/chats/:instance/presence',async(req,res,next)=>{
  try{res.json(await sendPresence(req.params.instance,req.body?.number,req.body?.presence||'composing',req.body?.delay||1000));}catch(e){next(e);}
});
inboxRouter.post('/chats/:instance/archive',async(req,res,next)=>{
  try{res.json(await archiveChat(req.params.instance,req.body?.chat,Boolean(req.body?.archive)));}catch(e){next(e);}
});
inboxRouter.delete('/chats/:instance/messages/:messageId',async(req,res,next)=>{
  try{res.json(await deleteMessageForEveryone(req.params.instance,{id:req.params.messageId,remoteJid:req.body?.remoteJid,fromMe:req.body?.fromMe!==false}));}catch(e){next(e);}
});
inboxRouter.patch('/chats/:instance/messages/:messageId',async(req,res,next)=>{
  try{res.json(await updateMessage(req.params.instance,{...req.body,id:req.params.messageId}));}catch(e){next(e);}
});
