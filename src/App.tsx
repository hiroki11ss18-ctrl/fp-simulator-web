import { useEffect, useMemo, useRef, useState } from 'react';
import Header, { TABS } from './components/Header';
import type { TabId } from './components/Header';
import BasicInfo from './components/tabs/BasicInfo';
import HousingPlan from './components/tabs/HousingPlan';
import LoanPlan from './components/tabs/LoanPlan';
import SolarBattery from './components/tabs/SolarBattery';
import Maintenance from './components/tabs/Maintenance';
import Lcc from './components/tabs/Lcc';
import Summary from './components/tabs/Summary';
import PrintProposal from './components/PrintProposal';
import { useCustomer } from './hooks/useCustomer';
import { DEFAULT_DATA } from './lib/defaults';
import { useCalculations } from './hooks/useCalculations';
import type { SimData, SimYears } from './types';
import { useReactToPrint } from 'react-to-print';

const LS_DRAFT = 'fp-sim:draft';

/** DEFAULT_DATA をベースに、override から「定義済みキー」のみ深くマージする
 *  - 旧スキーマで保存された JSON が混ざっても、欠落フィールドはデフォルト値で補完
 *  - 旧フィールド（例: data.children, data.utility）はそのまま破棄される
 */
export function mergeWithDefaults<T>(defaults: T, override: any): T {
  if (override == null || typeof override !== 'object') return defaults;
  if (Array.isArray(defaults)) {
    return (Array.isArray(override) ? override : defaults) as T;
  }
  const out: any = { ...(defaults as any) };
  for (const k of Object.keys(defaults as any)) {
    const d = (defaults as any)[k];
    const o = (override as any)[k];
    if (o === undefined || o === null) {
      out[k] = d;
    } else if (d !== null && typeof d === 'object' && !Array.isArray(d) && typeof o === 'object' && !Array.isArray(o)) {
      out[k] = mergeWithDefaults(d, o);
    } else {
      out[k] = o;
    }
  }
  return out as T;
}

function loadDraft(): SimData | null {
  try {
    const raw = localStorage.getItem(LS_DRAFT);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return mergeWithDefaults(DEFAULT_DATA, parsed);
  } catch {
    return null;
  }
}

export default function App() {
  const [data, setData] = useState<SimData>(() => loadDraft() ?? DEFAULT_DATA);
  const [active, setActive] = useState<TabId>('basic');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const { list, save, remove: removeCustomer, supabaseEnabled } = useCustomer();
  const calc = useCalculations(data);

  // Tabs[] の id 型に合わせる
  useEffect(() => {
    if (!TABS.find(t => t.id === active)) setActive('basic');
  }, [active]);

  // 自動下書き保存
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(LS_DRAFT, JSON.stringify(data)), 500);
    return () => clearTimeout(t);
  }, [data]);

  const update = (patch: Partial<SimData>) => setData(d => ({ ...d, ...patch }));

  const onSave = async () => {
    const name = data.basic.customerName.trim() || `無題（${new Date().toLocaleDateString('ja-JP')}）`;
    try {
      const row = await save(currentId, name, data);
      setCurrentId(row.id);
      alert('保存しました。');
    } catch (error) {
      console.error('Failed to save customer', error);
      alert('保存に失敗しました。通信状況やSupabase設定を確認してください。');
    }
  };

  // 当日付の DEFAULT_DATA を生成（DEFAULT_DATA はモジュール読込時の日付で固定されるため）
  const freshDefault = (): SimData => ({
    ...DEFAULT_DATA,
    basic: { ...DEFAULT_DATA.basic, date: new Date().toISOString().slice(0, 10) },
  });

  const onNew = () => {
    if (!confirm('新規顧客として入力をリセットしますか？\n（住宅資金計画・LCC・メンテナンスなど 全項目を原本の数字に戻します）')) return;
    setData(freshDefault());
    setCurrentId(null);
  };

  const onReset = () => {
    if (!confirm('入力内容を原本（テンプレート初期値）に戻しますか？\n住宅資金計画・LCC・メンテナンスも含めて 全項目リセットされます。')) return;
    setData(freshDefault());
  };

  const onSelect = (id: string | null) => {
    setCurrentId(id);
    if (!id) return;
    const row = list.find(r => r.id === id);
    if (row) setData(mergeWithDefaults(DEFAULT_DATA, row.data));
  };

  const onRemove = async (id: string) => {
    await removeCustomer(id);
    // 削除した顧客が現在選択中なら未選択に
    if (currentId === id) setCurrentId(null);
  };

  // 印刷（提案書）
  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `FP提案書_${data.basic.customerName || '無題'}_${data.basic.date}`,
    // 提案書印刷用ページスタイル
    //   - A4 縦、余白 10mm
    //   - テーブルヘッダーをページ越しで繰り返し
    //   - 色を確実に印刷
    pageStyle: `
      @page { size: A4 portrait; margin: 10mm; }
      @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
      }
    `,
  });

  // 印刷（現在のシート）— 表示中のタブをそのまま印刷
  const sheetRef = useRef<HTMLDivElement>(null);
  const activeTabLabel = TABS.find(t => t.id === active)?.label || 'シート';
  const handlePrintSheet = useReactToPrint({
    contentRef: sheetRef,
    documentTitle: `FP_${activeTabLabel}_${data.basic.customerName || '無題'}_${data.basic.date}`,
  });

  const setSimYears = (y: SimYears) => update({ simYears: y });

  const tabEl = useMemo(() => {
    switch (active) {
      case 'basic':   return <BasicInfo data={data} update={update} />;
      case 'housing': return <HousingPlan data={data} update={update} calc={calc} />;
      case 'loan':    return <LoanPlan data={data} update={update} calc={calc} />;
      case 'solar':   return <SolarBattery data={data} update={update} calc={calc} />;
      case 'maint':   return <Maintenance data={data} update={update} />;
      case 'lcc':     return <Lcc data={data} update={update} calc={calc} />;
      case 'summary': return <Summary data={data} calc={calc} />;
    }
  }, [active, data, calc]);

  return (
    <div className="min-h-screen bg-bg-page">
      <Header
        active={active}
        onChange={setActive}
        simYears={data.simYears}
        onChangeSimYears={setSimYears}
        customers={list}
        currentId={currentId}
        onSelectCustomer={onSelect}
        onRemoveCustomer={onRemove}
        onNew={onNew}
        onSave={onSave}
        onPrint={() => handlePrint()}
        onPrintSheet={() => handlePrintSheet()}
        onReset={onReset}
        cloudOn={supabaseEnabled}
      />

      <main className="max-w-[1400px] mx-auto px-6 py-6 no-print">
        <div ref={sheetRef} className="sheet-print-mode">
          {/* シート印刷時のヘッダー（印刷時のみ表示） */}
          <div className="print-only mb-4 pb-3 border-b-2 border-gray-300">
            <div className="flex justify-between items-end">
              <div>
                <div className="text-xs text-gray-500">FP Life Plan</div>
                <div className="text-lg font-bold">{activeTabLabel}</div>
              </div>
              <div className="text-xs text-right">
                <div>顧客: <strong>{data.basic.customerName || '—'} 様</strong></div>
                <div>担当: {data.basic.staffName || '—'} / 作成: {data.basic.date}</div>
              </div>
            </div>
          </div>
          {tabEl}
        </div>
      </main>

      {/* 印刷用領域（非表示。react-to-print が iframe で印刷） */}
      <div style={{ position: 'absolute', left: -10000, top: 0 }}>
        <PrintProposal ref={printRef} data={data} calc={calc} />
      </div>
    </div>
  );
}
