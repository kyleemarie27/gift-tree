import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { demoClient } from './demo.js';

export const isDemo = new URLSearchParams(window.location.search).has('demo');
export const configured = isDemo || !SUPABASE_URL.includes('REPLACE');
export const supabase = isDemo
  ? demoClient
  : configured
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'implicit' } })
    : null;
