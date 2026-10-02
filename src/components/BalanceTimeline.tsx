import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { CalcResult, SimData } from '../types';
import { buildBalanceTimeline, balanceAxis } from '../lib/balanceTimeline';
import { fmt, fmtBig } from '../lib/format';

export default function BalanceTimeline({ data, calc }: { data: SimData; calc: CalcResult }) {
  const timeline = useMemo(() => buildBalanceTimeline(data, calc), [data, calc]);
  const { points, first, last, milestones, retirementYear } = timeline;
  const axis = balanceAxis(points.map(p => p.balance));
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 720, height: 310 });
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const id = useId();
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const width = size.width, height = size.height, left = 66, right = 22, top = 30, bottom = 42;
  const plotWidth = Math.max(1, width - left - right), plotHeight = height - top - bottom;
  const x = (year: number) => left + year / Math.max(1, last.year) * plotWidth;
  const y = (balance: number) => top + (axis.max - balance) / (axis.max - axis.min) * plotHeight;
  const currentYear = Math.min(last.year, hoverYear ?? selectedYear ?? data.simYears);
  const current = points.find(p => p.year === currentYear) ?? first;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.year)},${y(p.balance)}`).join(' ');
  const area = `${line} L${x(last.year)},${y(0)} L${x(0)},${y(0)} Z`;
  const step = plotWidth < 480 ? 20 : 10;
  const ageTicks = points.filter(p => p.year % step === 0 || p.year === last.year);
  const eventYears = new Set(milestones.flatMap(m => m.point ? [m.point.year] : []));
  const retirementX = x(Math.max(0, Math.min(last.year, retirementYear)));
  const yearAtPointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const relative = (event.clientX - bounds.left) * width / bounds.width;
    return Math.max(0, Math.min(last.year, Math.round((relative - left) / plotWidth * last.year)));
  };
  const events = current.row?.events.join(' / ') || '';
  return <div className="balance-timeline">
    <div className="balance-caption"><span>購入後{last.year}年間 / 世帯主 {first.age}〜{last.age}歳</span><span>手元資金の残高</span></div>
    <dl className="balance-milestones">{milestones.map(m => <div key={m.key} data-milestone={m.key}>
      <dt>{m.label}</dt>
      <dd>{m.point ? <><span className="milestone-age">{m.point.age}歳</span><strong className={m.point.balance < 0 ? 'negative' : ''}>{fmt(m.point.balance)}<small>万円</small></strong></> : <span className="milestone-empty">{m.note}</span>}</dd>
    </div>)}</dl>
    <div className="balance-canvas" ref={frame}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`世帯主${first.age}歳から${last.age}歳までの手元資金。購入直後${fmt(first.balance)}万円、${last.age}歳で${fmt(last.balance)}万円。`} onPointerMove={e => { if (e.pointerType === 'mouse') setHoverYear(yearAtPointer(e)); }} onPointerLeave={() => setHoverYear(null)} onPointerDown={e => { setHoverYear(null); setSelectedYear(yearAtPointer(e)); }}>
        <defs>
          <clipPath id={`${id}-positive`}><rect x={left} y={top} width={plotWidth} height={Math.max(0, y(0) - top)} /></clipPath>
          <clipPath id={`${id}-negative`}><rect x={left} y={y(0)} width={plotWidth} height={Math.max(0, top + plotHeight - y(0))} /></clipPath>
        </defs>
        {retirementYear < last.year && <rect x={retirementX} y={top} width={width - right - retirementX} height={plotHeight} fill="#f0f7f3" />}
        {axis.min < 0 && <rect x={left} y={y(0)} width={plotWidth} height={top + plotHeight - y(0)} fill="#fff4f2" />}
        {retirementYear > 0 && retirementX - left > 70 && <text x={(left + retirementX) / 2} y={17} textAnchor="middle" fill="#586770" fontSize={12}>現役中</text>}
        {retirementYear < last.year && width - right - retirementX > 70 && <text x={(retirementX + width - right) / 2} y={17} textAnchor="middle" fill="#237f68" fontSize={12}>退職後</text>}
        {axis.ticks.map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? '#7c8990' : '#dfe7e9'} strokeWidth={tick === 0 ? 1.5 : 1} /><text x={left - 10} y={y(tick) + 4} textAnchor="end" fill="#586770" fontSize={11}>{tick === 0 ? '0円' : fmtBig(tick)}</text></g>)}
        {ageTicks.map(p => <g key={p.year}><line x1={x(p.year)} x2={x(p.year)} y1={top} y2={height - bottom} stroke="#e4eaed" /><text x={x(p.year)} y={height - 19} textAnchor="middle" fill="#263d49" fontSize={13}>{p.age}歳</text></g>)}
        <path d={area} fill="#287abe" fillOpacity={0.09} clipPath={`url(#${id}-positive)`} />
        <path d={area} fill="#b43d34" fillOpacity={0.08} clipPath={`url(#${id}-negative)`} />
        <path d={line} fill="none" stroke="#287abe" strokeWidth={3} clipPath={`url(#${id}-positive)`} />
        <path d={line} fill="none" stroke="#b43d34" strokeWidth={3} clipPath={`url(#${id}-negative)`} />
        {[...eventYears].map(year => { const p = points.find(point => point.year === year)!; return <circle key={year} cx={x(year)} cy={y(p.balance)} r={4} fill="white" stroke={p.balance < 0 ? '#b43d34' : '#287abe'} strokeWidth={2} />; })}
        <line x1={x(current.year)} x2={x(current.year)} y1={top} y2={height - bottom} stroke="#526874" opacity={0.65} />
        <circle cx={x(current.year)} cy={y(current.balance)} r={5} fill={current.balance < 0 ? '#b43d34' : '#287abe'} stroke="white" strokeWidth={2} />
      </svg>
    </div>
    <div className="balance-inspector">
      <div className="balance-readout">
        <div><span>世帯主の年齢</span><strong>{current.age}歳</strong><small>{current.year === 0 ? '購入直後' : `購入から${current.year}年後`}</small></div>
        <div><span>手元に残るお金</span><strong className={current.balance < 0 ? 'negative' : ''}>{fmt(current.balance)}<small>万円</small></strong></div>
        <div><span>その年の収支</span><strong className={current.row && current.row.net < 0 ? 'negative' : ''}>{current.row ? `${current.row.net > 0 ? '+' : ''}${fmt(current.row.net)}` : '対象外'}{current.row && <small>万円</small>}</strong></div>
      </div>
      <input className="balance-age-slider" type="range" aria-label="確認する年齢" min={0} max={last.year} step={1} value={current.year} aria-valuetext={`世帯主${current.age}歳、手元資金${fmt(current.balance)}万円`} onChange={e => { setHoverYear(null); setSelectedYear(Number(e.target.value)); }} />
      <div className="balance-year-events" title={events}><span>主な出来事</span><p>{current.year === 0 ? '住宅購入・自己資金の支払い後' : events || '登録なし'}</p></div>
    </div>
  </div>;
}
