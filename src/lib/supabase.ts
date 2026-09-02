import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseEnabled = Boolean(url && key);

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url!, key!)
  : null;

/**
 * Supabase テーブル定義例:
 * create table customers (
 *   id uuid primary key default gen_random_uuid(),
 *   name text not null,
 *   data jsonb not null,
 *   updated_at timestamptz default now()
 * );
 */
