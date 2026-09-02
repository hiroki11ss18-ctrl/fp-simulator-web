import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseEnabled } from '../lib/supabase';
import type { SimData } from '../types';
import { DEFAULT_DATA } from '../lib/defaults';

export interface CustomerRow {
  id: string;
  name: string;
  data: SimData;
  updated_at: string;
}

const LS_KEY = 'fp-sim:customers';

function readLocal(): CustomerRow[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function writeLocal(rows: CustomerRow[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows));
}

export function useCustomer() {
  const [list, setList] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    if (supabaseEnabled && supabase) {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('updated_at', { ascending: false });
      if (!error && data) setList(data as CustomerRow[]);
    } else {
      setList(readLocal());
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback(async (id: string | null, name: string, data: SimData): Promise<CustomerRow> => {
    const now = new Date().toISOString();
    if (supabaseEnabled && supabase) {
      if (id) {
        const { data: row, error } = await supabase
          .from('customers')
          .update({ name, data, updated_at: now })
          .eq('id', id)
          .select()
          .single();
        if (error || !row) throw error ?? new Error('保存結果を取得できませんでした。');
        await refresh();
        return row as CustomerRow;
      } else {
        const { data: row, error } = await supabase
          .from('customers')
          .insert({ name, data, updated_at: now })
          .select()
          .single();
        if (error || !row) throw error ?? new Error('保存結果を取得できませんでした。');
        await refresh();
        return row as CustomerRow;
      }
    } else {
      const rows = readLocal();
      if (id) {
        const idx = rows.findIndex(r => r.id === id);
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], name, data, updated_at: now };
          writeLocal(rows);
          setList([...rows]);
          return rows[idx];
        }
      }
      const newRow: CustomerRow = {
        id: crypto.randomUUID(),
        name,
        data,
        updated_at: now,
      };
      rows.unshift(newRow);
      writeLocal(rows);
      setList([...rows]);
      return newRow;
    }
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    if (supabaseEnabled && supabase) {
      await supabase.from('customers').delete().eq('id', id);
      await refresh();
    } else {
      const rows = readLocal().filter(r => r.id !== id);
      writeLocal(rows);
      setList(rows);
    }
  }, [refresh]);

  return { list, loading, refresh, save, remove, supabaseEnabled };
}

export { DEFAULT_DATA };
