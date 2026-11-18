import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function ErrorBanner({ message, onRetry = null, className = '' }) {
  if (!message) return null;
  return (
    <div
      className={`rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-start justify-between gap-4 ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <p className="text-sm text-red-200 leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-red-200 hover:text-white bg-red-500/20 hover:bg-red-500/30 px-2.5 py-1.5 rounded-lg shrink-0 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      )}
    </div>
  );
}

