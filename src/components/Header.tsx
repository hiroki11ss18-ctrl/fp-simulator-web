import { useEffect, useRef, useState } from 'react';
import { Button } from './ui';
import { Plus, Save, Printer, FileText, RotateCcw } from 'lucide-react';
import type { SimYears } from '../types';
import type { CustomerRow } from '../hooks/useCustomer';

export const TABS = [
  { id: 'basic', label: '基本情報' },
  { id: 'housing', label: '住宅資金計画' },
  { id: 'loan', label: 'ローン計画' },
  { id: 'solar', label: '太陽光・蓄電池' },
  { id: 'maint', label: 'メンテナンス' },
  { id: 'lcc', label: '家計・教育費' },
  { id: 'summary', label: '総合まとめ' },
] as const;
export type TabId = (typeof TABS)[number]['id'];

interface Props {
  active: TabId;
  onChange: (id: TabId) => void;
  simYears: SimYears;
  onChangeSimYears: (y: SimYears) => void;
  customers: CustomerRow[];
  currentId: string | null;
  onSelectCustomer: (id: string | null) => void;
  onRemoveCustomer: (id: string) => void;
  onNew: () => void;
  onSave: () => void;
  onPrint: () => void;
  onPrintSheet: () => void;
  onReset: () => void;
  cloudOn: boolean;
}

export default function Header(p: Props) {
  return (
    <header className="sticky top-0 z-30 bg-bg-page/95 backdrop-blur border-b border-line-card no-print">
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 pt-3 pb-0 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 bg-accent-blue rounded-[6px] flex items-center justify-center text-white text-sm font-bold">FP</div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-ink-main">住まいのFPシミュレーター Pro</div>
            <div className="text-[11px] text-ink-label">{p.cloudOn ? '☁ クラウド同期' : '💾 ローカル保存'}</div>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex flex-wrap items-center gap-2 header-actions">
          <div className="bg-bg-panel rounded-[8px] p-1 flex">
            {([30, 40, 50, 60] as SimYears[]).map(y => (
              <button
                key={y}
                onClick={() => p.onChangeSimYears(y)}
                className={`px-2.5 py-1 text-xs font-medium rounded-[6px] transition-colors ${p.simYears === y ? 'bg-accent-blue text-white' : 'text-ink-main hover:bg-bg-card'}`}
              >📅 {y}年</button>
            ))}
          </div>

          <CustomerSelector
            customers={p.customers}
            currentId={p.currentId}
            onSelect={p.onSelectCustomer}
            onRemove={p.onRemoveCustomer}
          />

          <Button onClick={p.onNew} title="新規顧客"><Plus size={16} />新規</Button>
          <Button variant="primary" onClick={p.onSave} title="保存"><Save size={16} />保存</Button>
          <Button onClick={p.onPrintSheet} title="今表示中のシートを印刷"><FileText size={16} />シート印刷</Button>
          <Button onClick={p.onPrint} title="お客様用の提案書を印刷・PDF保存"><Printer size={16} />提案書</Button>
          <Button variant="ghost" onClick={p.onReset} title="入力リセット"><RotateCcw size={16} /></Button>
        </div>
      </div>

      <nav className="max-w-[1400px] mx-auto px-6 mt-3">
        <ul className="flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <li key={t.id}>
              <button
                onClick={() => p.onChange(t.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  p.active === t.id
                    ? 'border-accent-blue text-accent-blue'
                    : 'border-transparent text-ink-sub hover:text-ink-main'
                }`}
              >{t.label}</button>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

// ─── 顧客セレクター（カスタムドロップダウン + 削除ボタン） ───
function CustomerSelector({ customers, currentId, onSelect, onRemove }: {
  customers: CustomerRow[];
  currentId: string | null;
  onSelect: (id: string | null) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = customers.find(c => c.id === currentId);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (!confirm(`「${name || '(無題)'}」を削除しますか?\nこの操作は取り消せません。`)) return;
    onRemove(id);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-3 py-2 bg-bg-card border border-line-card rounded-[8px] text-sm text-ink-main outline-none hover:border-accent-blue/40 min-w-[200px] text-left flex items-center justify-between gap-2 transition-colors"
      >
        <span className="truncate">👤 {current?.name || '顧客を選択...'}</span>
        <span className={`text-ink-sub text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-bg-card border border-line-card rounded-[10px] shadow-card min-w-[300px] max-h-[400px] overflow-y-auto z-50">
          {/* 未選択オプション */}
          <button
            type="button"
            onClick={() => { onSelect(null); setOpen(false); }}
            className={`w-full text-left px-3 py-2.5 text-sm hover:bg-bg-panel border-b border-line-table ${!currentId ? 'bg-bg-panel/60 text-ink-main font-medium' : 'text-ink-sub'}`}
          >
            (顧客 未選択)
          </button>
          {customers.length === 0 && (
            <div className="px-3 py-4 text-xs text-ink-sub italic text-center">保存された顧客はありません</div>
          )}
          {customers.map(c => {
            const isActive = c.id === currentId;
            return (
              <div
                key={c.id}
                className={`flex items-center border-b border-line-table last:border-b-0 transition-colors ${isActive ? 'bg-accent-blue/10' : 'hover:bg-bg-panel'}`}
              >
                <button
                  type="button"
                  onClick={() => { onSelect(c.id); setOpen(false); }}
                  className="flex-1 text-left px-3 py-2.5 text-sm min-w-0"
                >
                  <div className={`truncate ${isActive ? 'font-bold text-accent-blue' : 'text-ink-main'}`}>
                    {c.name || '(無題)'}
                  </div>
                  <div className="text-[10px] text-ink-sub mt-0.5">
                    更新: {new Date(c.updated_at).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={e => handleDelete(e, c.id, c.name)}
                  className="px-3 py-2.5 text-status-danger hover:bg-status-danger/15 transition-colors text-base"
                  title="この顧客を削除"
                >
                  🗑
                </button>
              </div>
            );
          })}
          {customers.length > 0 && (
            <div className="bg-bg-panel/40 px-3 py-2 text-[10px] text-ink-sub text-center border-t border-line-table">
              {customers.length} 件保存中
            </div>
          )}
        </div>
      )}
    </div>
  );
}
