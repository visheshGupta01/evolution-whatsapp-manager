import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url=String(process.env.SUPABASE_URL||'').trim();
const serviceKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
if(!url||!serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');

export const supabase=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
