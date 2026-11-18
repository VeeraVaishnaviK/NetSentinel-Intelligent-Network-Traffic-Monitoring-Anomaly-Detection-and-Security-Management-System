import React from 'react';

const ICON_ACCENT = {
  mint: 'bg-[#d4f3ea] text-[#1c6b57] border-[#bce8db] dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  sky: 'bg-[#d9edf7] text-[#244a5c] border-[#bfdceb] dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
  blue: 'bg-[#dde9f8] text-[#254d7a] border-[#c2d7f0] dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
  emerald: 'bg-[#d8f3e5] text-[#1b6b46] border-[#bde6d1] dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  amber: 'bg-[#fbead6] text-[#9a5514] border-[#f2d4b0] dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  red: 'bg-[#f8dfd7] text-[#a53e2b] border-[#ecc2b5] dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  peach: 'bg-[#f6dfd6] text-[#9b3d28] border-[#e8bfb0] dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  slate: 'bg-[#e6eff4] text-[#355466] border-[#cddde6] dark:bg-slate-700/40 dark:text-slate-300 dark:border-slate-700',
};

export default function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  accent = 'mint',
  mono = false,
  variant = 'default', // 'default' | 'inner' | 'alert'
}) {
  const iconCls = ICON_ACCENT[accent] || ICON_ACCENT.mint;

  const containerCls =
    variant === 'alert'
      ? 'bg-[#fdf5f1] dark:bg-red-950/20 border border-[#e7bfb0] dark:border-red-500/30 rounded-xl p-4'
      : variant === 'inner'
      ? 'bg-[#f6fafc] dark:bg-navy-900/80 border border-[#d6e6ef] dark:border-slate-800 rounded-xl p-4'
      : 'ns-card p-4 hover:shadow-card-hover transition-shadow';

  return (
    <div className={`${containerCls} flex items-center gap-3.5 min-w-0`}>
      {Icon && (
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${iconCls}`}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div
          className={`text-xl font-bold text-[#1a3342] dark:text-slate-100 truncate leading-tight ${
            mono ? 'font-mono' : ''
          }`}
          title={String(value ?? '')}
        >
          {value ?? '—'}
        </div>
        <div className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate mt-0.5">
          {label}
        </div>
        {subtext && (
          <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5" title={subtext}>
            {subtext}
          </div>
        )}
      </div>
    </div>
  );
}
