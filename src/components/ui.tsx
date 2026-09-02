import React from 'react';

// 文字列の先頭にある絵文字・装飾記号を取り除く（"絵文字＋空白" が連続する限り除去）
const LEADING_DECOR_RE = /^(?:\p{Extended_Pictographic}|️|‍|[☀-➿])+\s*/u;
function stripLeadingDecor(s: unknown): string {
  if (typeof s !== 'string') return String(s ?? '');
  return s.replace(LEADING_DECOR_RE, '').trim();
}

type AccentColor = 'blue' | 'green' | 'orange' | 'red' | 'gray';
const ACCENT_CLASS: Record<AccentColor, string> = {
  blue:   'bg-accent-blue',
  green:  'bg-status-ok',
  orange: 'bg-status-warn',
  red:    'bg-status-danger',
  gray:   'bg-ink-sub',
};

export function Card({ title, children, className = '', right, accent = 'blue' }: { title?: string; children: React.ReactNode; className?: string; right?: React.ReactNode; accent?: AccentColor }) {
  const cleanTitle = title ? stripLeadingDecor(title) : '';
  return (
    <section className={`bg-bg-card border border-line-card rounded-[8px] shadow-card ${className}`}>
      {cleanTitle && (
        <header className="px-5 pt-4 pb-3 border-b border-line-card flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`w-[3px] h-4 rounded-full flex-shrink-0 ${ACCENT_CLASS[accent]}`} />
            <h3 className="text-[13px] font-bold text-ink-main tracking-wider truncate">{cleanTitle}</h3>
          </div>
          {right && <div className="flex-shrink-0">{right}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  const cleanLabel = stripLeadingDecor(label);
  return (
    <label className={`block ${className}`}>
      <div className="text-[11px] tracking-wider text-ink-label font-semibold mb-1.5 uppercase">{cleanLabel}</div>
      {children}
      {hint && <div className="text-[11px] text-ink-sub mt-1.5">{hint}</div>}
    </label>
  );
}

export function NumInput({
  value, onChange, step = 10, min = 0, max, suffix, className = '', placeholder = '0',
}: { value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; suffix?: string; className?: string; placeholder?: string }) {
  // value === 0 のときは空欄表示にして、ユーザがすぐ数値を入力できるようにする
  const display = !Number.isFinite(value) || value === 0 ? '' : value;
  // 入力値を min/max の範囲に丸める（負値・上限超え禁止）
  const clamp = (n: number): number => {
    if (!Number.isFinite(n)) return min;
    let out = n;
    if (out < min) out = min;
    if (max !== undefined && out > max) out = max;
    return out;
  };
  return (
    <div className={`flex items-center bg-bg-card border border-line-card rounded-[8px] focus-within:border-accent-blue ${className}`}>
      <input
        type="number"
        className="w-full px-3 py-2 bg-transparent outline-none tabular text-right text-ink-main placeholder:text-ink-sub/50"
        value={display}
        placeholder={placeholder}
        step={step}
        min={min}
        max={max}
        onChange={e => onChange(e.target.value === '' ? min : clamp(Number(e.target.value)))}
        onKeyDown={e => {
          // マイナス記号・指数表記の文字を抑制
          if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
        }}
      />
      {suffix && <span className="px-3 text-ink-sub text-sm select-none">{suffix}</span>}
    </div>
  );
}

export function TextInput({ value, onChange, placeholder, className = '' }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <input
      type="text"
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-full px-3 py-2 bg-bg-card border border-line-card rounded-[8px] outline-none focus:border-accent-blue text-ink-main ${className}`}
    />
  );
}

export function Select<T extends string | number>({ value, onChange, options, className = '' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <select
      value={value as any}
      onChange={e => {
        const raw = e.target.value;
        const sample = options[0]?.value;
        onChange((typeof sample === 'number' ? Number(raw) : raw) as T);
      }}
      className={`w-full px-3 py-2 bg-bg-card border border-line-card rounded-[8px] outline-none focus:border-accent-blue text-ink-main ${className}`}
    >
      {options.map(o => <option key={String(o.value)} value={o.value as any}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <span
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full relative transition-colors ${checked ? 'bg-accent-blue' : 'bg-line-card'}`}
      >
        <span className={`absolute top-0.5 ${checked ? 'left-[18px]' : 'left-0.5'} w-4 h-4 bg-white rounded-full shadow transition-all`} />
      </span>
      {label && <span className="text-sm text-ink-main">{label}</span>}
    </label>
  );
}

export function Button({ children, onClick, variant = 'default', className = '', title }:
  { children: React.ReactNode; onClick?: () => void; variant?: 'default' | 'primary' | 'ghost' | 'danger'; className?: string; title?: string }) {
  const base = 'px-3 py-2 rounded-[8px] text-sm font-medium transition-colors inline-flex items-center gap-1.5';
  const styles = {
    default: 'bg-bg-card text-ink-main border border-line-card hover:bg-bg-panel',
    primary: 'bg-accent-blue text-white hover:bg-[#256AB0]',
    ghost: 'text-ink-main hover:bg-bg-panel',
    danger: 'bg-status-danger text-white hover:bg-[#C84F44]',
  } as const;
  return <button title={title} onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>{children}</button>;
}

export function StatBox({ label, value, suffix = '万円', tone = 'normal' }: { label: string; value: number | string; suffix?: string; tone?: 'normal' | 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-accent-blue' : tone === 'bad' ? 'text-status-danger' : 'text-ink-main';
  return (
    <div className="bg-bg-panel rounded-[8px] px-4 py-3">
      <div className="text-[11px] text-ink-label">{label}</div>
      <div className={`text-xl font-bold tabular mt-0.5 ${color}`}>
        {typeof value === 'number' ? value.toLocaleString('ja-JP') : value}
        <span className="text-xs text-ink-sub font-normal ml-1">{suffix}</span>
      </div>
    </div>
  );
}

export function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  const cleanTitle = stripLeadingDecor(title);
  return (
    <div className={className}>
      <div className="text-[11px] font-bold text-ink-sub mb-2 tracking-widest uppercase flex items-center gap-2">
        <span className="w-3 h-px bg-ink-sub/40" />
        {cleanTitle}
      </div>
      {children}
    </div>
  );
}
