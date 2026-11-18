import React from 'react';

const ACCENT_MAP = {
  sky: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  red: 'text-red-400 bg-red-500/10 border-red-500/20',
  slate: 'text-slate-300 bg-slate-500/10 border-slate-500/20',
};

export default function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  accent = 'sky',
  mono = false,
}) {
  const accentCls = ACCENT_MAP[accent] || ACCENT_MAP.sky;
  return (
    <div className="ns-card p-4 flex flex-col justify-between hover:border-slate-700/90 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
          {label}
        </span>
        {Icon && (
          <div className={`p-2 rounded-lg border ${accentCls}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="mt-3">
        <div
          className={`text-xl font-semibold text-slate-100 truncate ${
            mono ? 'font-mono' : ''
          }`}
          title={String(value ?? '')}
        >
          {value ?? '—'}
        </div>
        {subtext && (
          <p className="mt-1 text-xs text-slate-400 truncate" title={subtext}>
            {subtext}
          </p>
        )}
      </div>
    </div>
  );
}

