import React from 'react';

const STYLES = {
  online: 'bg-[#d8f3e5] text-[#176442] border-[#b7e4cd] dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  healthy: 'bg-[#d8f3e5] text-[#176442] border-[#b7e4cd] dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  active: 'bg-[#d8f3e5] text-[#176442] border-[#b7e4cd] dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  success: 'bg-[#d8f3e5] text-[#176442] border-[#b7e4cd] dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  resolved: 'bg-[#d8f3e5] text-[#176442] border-[#b7e4cd] dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  trusted: 'bg-[#d9edf7] text-[#1f4e68] border-[#b9d9ea] dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',

  warning: 'bg-[#fef0dc] text-[#9a5514] border-[#f3d4aa] dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  medium: 'bg-[#fef0dc] text-[#9a5514] border-[#f3d4aa] dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  acknowledged: 'bg-[#fef0dc] text-[#9a5514] border-[#f3d4aa] dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  timeout: 'bg-[#fef0dc] text-[#9a5514] border-[#f3d4aa] dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  degraded: 'bg-[#fef0dc] text-[#9a5514] border-[#f3d4aa] dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  unapproved: 'bg-[#fef0dc] text-[#9a5514] border-[#f3d4aa] dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  demo: 'bg-[#f8dfd7] text-[#9b3d28] border-[#e7bcae] dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-400/40',
  new: 'bg-[#d4f3ea] text-[#166653] border-[#aee4d5] dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30',

  critical: 'bg-[#fae0da] text-[#a53524] border-[#eabbb0] dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40',
  high: 'bg-[#fae0da] text-[#a53524] border-[#eabbb0] dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
  alert: 'bg-[#fae0da] text-[#a53524] border-[#eabbb0] dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  failed: 'bg-[#fae0da] text-[#a53524] border-[#eabbb0] dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
  open: 'bg-[#fae0da] text-[#a53524] border-[#eabbb0] dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',

  offline: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/60 dark:text-slate-300 dark:border-slate-600',
  stopped: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-700/60 dark:text-slate-300 dark:border-slate-600',
  low: 'bg-[#e3f0f7] text-[#244a5c] border-[#c4dceb] dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',

  tcp: 'bg-[#dcebf2] text-[#1f4152] border-[#bfd7e4] dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
  udp: 'bg-[#e4e8f7] text-[#354587] border-[#c8d0ee] dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30',
  dns: 'bg-[#d8f3e5] text-[#176442] border-[#b7e4cd] dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  http: 'bg-[#fef0dc] text-[#9a5514] border-[#f3d4aa] dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  icmp: 'bg-[#fae0da] text-[#a53524] border-[#eabbb0] dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
  arp: 'bg-[#ede4f7] text-[#5c3688] border-[#d6c2ee] dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30',
};

export default function StatusBadge({ label, variant, dot = false, className = '' }) {
  const key = (variant || label || '').toString().toLowerCase();
  const style =
    STYLES[key] ||
    'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-700/60 dark:text-slate-300 dark:border-slate-600';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${style} ${className}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}
