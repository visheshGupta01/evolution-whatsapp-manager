import { authUser, requirePermission } from './auth.routes.js';
import { Router } from 'express';
import { pool } from '../services/db.js';

export const audiencesRouter = Router();
audiencesRouter.use(authUser);


const MAX_RECIPIENTS = 2500;
const PHONE_HEADERS = ['phone', 'number', 'mobile', 'mobilenumber', 'whatsapp', 'whatsappnumber', 'contact', 'phonenumber'];

function normalizePhone(value) {
  return String(value ?? '').trim().replace(/[^0-9]/g, '');
}

function validateRecipients(input) {
  if (!Array.isArray(input) || !input.length) throw Object.assign(new Error('At least one recipient is required.'), { status: 400 });
  if (input.length > MAX_RECIPIENTS) throw Object.assign(new Error(`An audience is limited to ${MAX_RECIPIENTS} recipients.`), { status: 400 });
  const seen = new Set();
  const recipients = [];
  const invalid = [];
  for (let i = 0; i < input.length; i += 1) {
    const raw = input[i] || {};
    const phone = normalizePhone(raw.phone ?? raw.number);
    if (!phone || phone.length < 8 || phone.length > 15 || seen.has(phone)) {
      invalid.push(i + 1);
      continue;
    }
    seen.add(phone);
    recipients.push({
      phone,
      ...(raw.name ? { name: String(raw.name).trim() } : {}),
      ...(raw.company ? { company: String(raw.company).trim() } : {}),
      ...(raw.custom1 ? { custom1: String(raw.custom1).trim() } : {}),
      ...(raw.custom2 ? { custom2: String(raw.custom2).trim() } : {}),
    });
  }
  if (!recipients.length) throw Object.assign(new Error('No valid unique phone numbers were provided.'), { status: 400 });
  return { recipients, skipped: invalid.length };
}

async function getAudience(id) {
  const { rows } = await pool.query('SELECT id,name,description,created_at,updated_at FROM audiences WHERE id=$1', [id]);
  if (!rows[0]) return null;
  const data = await pool.query('SELECT recipient_index,recipient FROM audience_recipients WHERE audience_id=$1 ORDER BY recipient_index', [id]);
  return {
    id: rows[0].id, name: rows[0].name, description: rows[0].description,
    createdAt: rows[0].created_at, updatedAt: rows[0].updated_at,
    total: data.rows.length, recipients: data.rows.map((r) => r.recipient || {}),
  };
}

audiencesRouter.get('/', requirePermission('campaigns'), async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.id,a.name,a.description,a.created_at,a.updated_at,COUNT(ar.recipient_index)::int AS total
      FROM audiences a LEFT JOIN audience_recipients ar ON ar.audience_id=a.id
      GROUP BY a.id ORDER BY a.updated_at DESC
    `);
    res.json(rows.map((r) => ({ id:r.id,name:r.name,description:r.description,total:Number(r.total),createdAt:r.created_at,updatedAt:r.updated_at })));
  } catch (error) { next(error); }
});

audiencesRouter.get('/:id', requirePermission('campaigns'), async (req, res, next) => {
  try {
    const audience = await getAudience(req.params.id);
    if (!audience) return res.status(404).json({ ok:false, message:'Audience not found.' });
    res.json(audience);
  } catch (error) { next(error); }
});

audiencesRouter.post('/', requirePermission('campaigns'), async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ ok:false, message:'Audience name is required.' });
    const { recipients, skipped } = validateRecipients(req.body?.recipients);
    const id = `aud_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
    await pool.query('BEGIN');
    try {
      await pool.query('INSERT INTO audiences(id,name,description) VALUES($1,$2,$3)', [id,name,String(req.body?.description || '').trim()]);
      for (let i=0;i<recipients.length;i+=1) await pool.query(
        'INSERT INTO audience_recipients(audience_id,recipient_index,phone,recipient) VALUES($1,$2,$3,$4::jsonb)',
        [id,i,recipients[i].phone,JSON.stringify(recipients[i])]
      );
      await pool.query('COMMIT');
    } catch (error) { await pool.query('ROLLBACK'); throw error; }
    res.status(201).json({ ...(await getAudience(id)), skipped });
  } catch (error) { next(error); }
});

audiencesRouter.put('/:id', requirePermission('campaigns'), async (req, res, next) => {
  try {
    const existing = await getAudience(req.params.id);
    if (!existing) return res.status(404).json({ ok:false, message:'Audience not found.' });
    const name = String(req.body?.name ?? existing.name).trim();
    if (!name) return res.status(400).json({ ok:false, message:'Audience name is required.' });
    const { recipients, skipped } = validateRecipients(req.body?.recipients ?? existing.recipients);
    await pool.query('BEGIN');
    try {
      await pool.query('UPDATE audiences SET name=$1,description=$2,updated_at=NOW() WHERE id=$3', [name,String(req.body?.description ?? existing.description).trim(),req.params.id]);
      await pool.query('DELETE FROM audience_recipients WHERE audience_id=$1', [req.params.id]);
      for (let i=0;i<recipients.length;i+=1) await pool.query(
        'INSERT INTO audience_recipients(audience_id,recipient_index,phone,recipient) VALUES($1,$2,$3,$4::jsonb)',
        [req.params.id,i,recipients[i].phone,JSON.stringify(recipients[i])]
      );
      await pool.query('COMMIT');
    } catch (error) { await pool.query('ROLLBACK'); throw error; }
    res.json({ ...(await getAudience(req.params.id)), skipped });
  } catch (error) { next(error); }
});

audiencesRouter.delete('/:id', requirePermission('campaigns'), async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM audiences WHERE id=$1', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ ok:false, message:'Audience not found.' });
    res.status(204).end();
  } catch (error) { next(error); }
});
