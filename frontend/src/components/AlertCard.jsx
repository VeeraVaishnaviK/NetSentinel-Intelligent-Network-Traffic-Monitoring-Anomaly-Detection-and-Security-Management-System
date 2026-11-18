import React from 'react';
import { CheckCircle2, Eye, ShieldAlert, Clock, ArrowRight } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { formatDateTime } from '../utils/formatters';

export default function AlertCard({ alert, onAcknowledge, onResolve, onSelect, compact = false }) {
  return (
    <div
      className={`rounded-2xl border p-4 transition-colors shadow-card ${
        alert.status === 'open'
          ? 'bg-white dark:bg-navy-850 border-[#e5c2b6] dark:border-slate-700 hover:border-[#d59d8a]'
          : 'bg-[#f6fafc] dark:bg-navy-900/70 border-[#d6e6ef] dark:border-slate-800 opacity-90'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <ShieldAlert
            className={`w-4 h-4 shrink-0 ${
              alert.severity === 'Critical' || alert.severity === 'High'
                ? 'text-[#c95944]'
                : alert.severity === 'Medium'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-[#244a5c] dark:text-sky-400'
            }`}
          />
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {alert.alert_code}
          </span>
          <StatusBadge label={alert.severity} variant={alert.severity} />
          <StatusBadge label={alert.status} variant={alert.status} />
          {alert.is_demo && <StatusBadge label="DEMO" variant="demo" />}
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 font-mono">
          <Clock className="w-3.5 h-3.5" />
          {formatDateTime(alert.detected_at)}
        </span>
      </div>

      <h4 className="mt-2.5 text-sm font-bold text-[#1a3342] dark:text-slate-100">{alert.title}</h4>

      <div className="mt-1.5 flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-300">
        <span>Src: {alert.src_ip || 'N/A'}</span>
        {alert.dst_ip && (
          <>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
            <span>Dst: {alert.dst_ip}</span>
          </>
        )}
      </div>

      {!compact && (
        <>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {alert.reason}
          </p>
          <div className="mt-2.5 rounded-xl bg-[#f2f8fb] dark:bg-navy-900 border border-[#d6e6ef] dark:border-slate-800 px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
            <span className="font-semibold text-[#244a5c] dark:text-sky-400">
              Recommended action:{' '}
            </span>
            {alert.recommended_action}
          </div>
        </>
      )}

      {(onAcknowledge || onResolve || onSelect) && (
        <div className="mt-3 pt-2.5 border-t border-[#e4eff5] dark:border-slate-800 flex items-center justify-end gap-2">
          {onSelect && (
            <button
              type="button"
              onClick={() => onSelect(alert)}
              className="ns-btn-secondary !py-1.5 !px-2.5 !text-xs"
            >
              <Eye className="w-3.5 h-3.5" />
              Details
            </button>
          )}
          {onAcknowledge && alert.status === 'open' && (
            <button
              type="button"
              onClick={() => onAcknowledge(alert.id)}
              className="ns-btn-secondary !py-1.5 !px-2.5 !text-xs !bg-[#fef0dc] !text-[#9a5514] !border-[#f3d4aa] dark:!bg-amber-500/15 dark:!text-amber-300"
            >
              Acknowledge
            </button>
          )}
          {onResolve && alert.status !== 'resolved' && (
            <button
              type="button"
              onClick={() => onResolve(alert.id)}
              className="ns-btn-secondary !py-1.5 !px-2.5 !text-xs !bg-[#d8f3e5] !text-[#176442] !border-[#b7e4cd] dark:!bg-emerald-500/15 dark:!text-emerald-300"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Resolve
            </button>
          )}
        </div>
      )}
    </div>
  );
}
