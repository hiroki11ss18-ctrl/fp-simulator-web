import { useEffect, useMemo, useRef, useState } from 'react';
import Header, { TABS } from './components/Header';
import type { TabId } from './components/Header';
import BasicInfo from './components/tabs/BasicInfo';
import HousingPlan from './components/tabs/HousingPlan';
import LoanPlan from './components/tabs/LoanPlan';
import SolarBattery from './components/tabs/SolarBattery';
import Maintenance from './components/tabs/Maintenance';
import Lcc from './components/tabs/Lcc';
import Summary, { downloadText } from './components/tabs/Summary';
import { Download, Upload } from 'lucide-react';
import { normalizeData } from './lib/data';
import { localISODate } from './lib/format';
import PrintProposal from './components/PrintProposal';
import { useCustomer } from './hooks/useCustomer';
import { DEFAULT_DATA } from './lib/defaults';
import { useCalculations } from './hooks/useCalculations';
import type { SimData, SimYears } from './types';
import { useReactToPrint } from 'react-to-print';

const LS_DRAFT = 'fp-sim:draft';
let draftLoadError = '';

export { mergeWithDefaults } from './lib/data';

function loadDraft(): SimData | null {
  try {
    const raw = localStorage.getItem(LS_DRAFT);
    if (!raw) return null;
    if (!localStorage.getItem('fp-sim:draft:before-2026-09')) localStorage.setItem('fp-sim:draft:before-2026-09', raw);
    const parsed = JSON.parse(raw);
    return normalizeData(parsed);
  } catch {
    draftLoadError = '保存済みの下書きを読み込めませんでした。元データは保持しています。バックアップからの復元を確認してください。';
    return null;
  }
}

export default function App() {
  const [data, setData] = useState<SimData>(() => loadDraft() ?? DEFAULT_DATA);
  const [active, setActive] = useState<TabId>('basic');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(draftLoadError);
  const { list, save, remove: removeCustomer, supabaseEnabled, errorMessage: customerError } = useCustomer();
  const calc = useCalculations(data);

  // Tabs[] の id 型に合わせる
  useEffect(() => {
    if (!TABS.find(t => t.id === active)) setActive('basic');
  }, [active]);

  // 自動下書き保存
  useEffect(() => {
    if (draftLoadError) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(LS_DRAFT, JSON.stringify(data)); setStorageError(''); }
      catch { setStorageError('このブラウザーに下書きを保存できません。入力データをファイル保存してください。'); }
    }, 500);
    return () => clearTimeout(t);
  }, [data]);

  const update = (patch: Partial<SimData>) => setData(d => ({ ...d, ...patch,
    reviewChecks: patch.reviewChecks ?? (Object.keys(patch).every(k => k === 'simYears') ? d.reviewChecks : { ...DEFAULT_DATA.reviewChecks }),
  }));

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
    basic: { ...DEFAULT_DATA.basic, date: localISODate() },
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
    if (row) setData(normalizeData(row.data));
  };

  const onRemove = async (id: string) => {
    try { await removeCustomer(id); }
    catch { alert('削除に失敗しました。保存先をご確認ください。'); return; }
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

  const exportProposal = async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const html = '<!DOCTYPE html>' + renderToStaticMarkup(<html lang="ja"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>ライフプラン提案書 {data.basic.customerName}</title></head><body><PrintProposal data={data} calc={calc} /></body></html>);
    downloadText('FP提案書_' + data.basic.date + '.html', html, 'text/html;charset=utf-8');
  };
  const exportData = () => downloadText('FP入力データ_' + data.basic.date + '.json', JSON.stringify({ schemaVersion: 2, exportedAt: new Date().toISOString(), data }, null, 2), 'application/json');
  const importData = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('size');
      const parsed = JSON.parse(await file.text());
      const raw = parsed.data ?? parsed;
      if (!raw.basic || !raw.housing || !raw.loan || !raw.household) throw new Error('format');
      if (!confirm('現在の入力をファイルの内容に置き換えますか？未保存の入力は先にファイル保存してください。')) return;
      setData(normalizeData(raw)); setCurrentId(null); draftLoadError = ''; setStorageError('');
    } catch { alert('このファイルは読み込めません。FP入力データのJSONファイルを選んでください。'); }
  };

  const tabEl = useMemo(() => {
    switch (active) {
      case 'basic':   return <BasicInfo data={data} update={update} />;
      case 'housing': return <HousingPlan data={data} update={update} calc={calc} />;
      case 'loan':    return <LoanPlan data={data} update={update} calc={calc} />;
      case 'solar':   return <SolarBattery data={data} update={update} calc={calc} />;
      case 'maint':   return <Maintenance data={data} update={update} calc={calc} />;
      case 'lcc':     return <Lcc data={data} update={update} calc={calc} />;
      case 'summary': return <Summary data={data} calc={calc} onPrint={() => handlePrint()} onExport={exportProposal} />;
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

      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-6 no-print">
        <div className="data-toolbar">
          <span>{supabaseEnabled ? '顧客データはクラウド連携中' : '顧客データはこのブラウザーに保存。他のPCへは入力データを移してください。'}</span>
          <button title="入力データをファイル保存" onClick={exportData}><Download size={16} />入力データ保存</button>
          <label><Upload size={16} />入力データ読込<input type="file" accept=".json,application/json" onChange={e => { void importData(e.target.files?.[0]); e.target.value = ''; }} /></label>
        </div>
        {storageError && <p className="decision-band risk" role="alert">{storageError}</p>}
        {customerError && <p className="decision-band risk" role="alert">{customerError}</p>}
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
      <div aria-hidden="true" style={{ position: 'absolute', left: -10000, top: 0, width: '190mm' }}>
        <PrintProposal ref={printRef} data={data} calc={calc} />
      </div>
    </div>
  );
}
