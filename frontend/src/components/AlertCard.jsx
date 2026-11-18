import React from 'react';
import { CheckCircle2, Eye, ShieldAlert, Clock, ArrowRight } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { formatDateTime } from '../utils/formatters';

export default function AlertCard({ alert, onAcknowledge, onResolve, onSelect, compact = false }) {
  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        alert.status === 'open'
          ? 'bg-navy-800/90 border-slate-700/90 hover:border-slate-600'
          : 'bg-navy-900/60 border-slate-800/80 opacity-85'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <ShieldAlert
            className={`w-4 h-4 shrink-0 ${
              alert.severity === 'Critical' || alert.severity === 'High'
                ? 'text-red-400'
                : alert.severity === 'Medium'
                ? 'text-amber-400'
                : 'text-sky-400'
            }`}
          />
          <span className="font-mono text-xs text-slate-400">{alert.alert_code}</span>
          <StatusBadge label={alert.severity} variant={alert.severity} />
          <StatusBadge label={alert.status} variant={alert.status} />
          {alert.is_demo && <StatusBadge label="DEMO" variant="demo" />}
        </div>
        <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-mono">
          <Clock className="w-3.5 h-3.5" />
          {formatDateTime(alert.detected_at)}
        </span>
      </div>

      <h4 className="mt-2.5 text-sm font-semibold text-slate-100">{alert.title}</h4>

      <div className="mt-1.5 flex items-center gap-2 text-xs font-mono text-slate-300">
        <span>Src: {alert.src_ip || 'N/A'}</span>
        {alert.dst_ip && (
          <>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
            <span>Dst: {alert.dst_ip}</span>
          </>
        )}
      </div>

      {!compact && (
        <>
          <p className="mt-2 text-xs text-slate-300 leading-relaxed">{alert.reason}</p>
          <div className="mt-2.5 rounded-lg bg-navy-900/80 border border-slate-800 px-3 py-2 text-xs text-slate-400">
            <span className="font-medium text-sky-400">Recommended action: </span>
            {alert.recommended_action}
          </div>
        </>
      )}

      {(onAcknowledge || onResolve || onSelect) && (
        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-end gap-2">
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
              className="ns-btn-secondary !py-1.5 !px-2.5 !text-xs text-amber-300 border-amber-500/30 hover:bg-amber-500/10"
            >
              Acknowledge
            </button>
          )}
          {onResolve && alert.status !== 'resolved' && (
            <button
              type="button"
              onClick={() => onResolve(alert.id)}
              className="ns-btn-secondary !py-1.5 !px-2.5 !text-xs text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/10"
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

