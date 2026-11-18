import React from 'react';

const STYLES = {
  // Health & Device status
  online: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  healthy: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  trusted: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',

  // Warnings / Medium / Acknowledged / Demo
  warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  acknowledged: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  timeout: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  degraded: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  new: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  demo: 'bg-amber-500/20 text-amber-300 border-amber-400/40',

  // Critical / High / Offline / Failed
  critical: 'bg-red-500/20 text-red-400 border-red-500/40',
  high: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  alert: 'bg-red-500/15 text-red-400 border-red-500/30',
  offline: 'bg-slate-700/60 text-slate-400 border-slate-600/60',
  stopped: 'bg-slate-700/60 text-slate-400 border-slate-600/60',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  open: 'bg-red-500/15 text-red-400 border-red-500/30',
  unapproved: 'bg-amber-500/15 text-amber-400 border-amber-500/30',

  // Low / Neutral
  low: 'bg-sky-500/15 text-sky-300 border-sky-500/30',

  // Protocols
  tcp: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  udp: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  dns: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  http: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  icmp: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  arp: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
};

export default function StatusBadge({ label, variant, dot = false, className = '' }) {
  const key = (variant || label || '').toString().toLowerCase();
  const style = STYLES[key] || 'bg-slate-700/60 text-slate-300 border-slate-600/60';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${style} ${className}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {label}
    </span>
  );
}

