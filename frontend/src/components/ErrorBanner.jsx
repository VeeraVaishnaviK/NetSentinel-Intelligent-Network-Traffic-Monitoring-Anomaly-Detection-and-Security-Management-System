import React from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

export default function ErrorBanner({ message, onRetry = null, onDismiss = null, className = '' }) {
  if (!message) return null;
  return (
    <div
      className={`rounded-2xl border border-[#eabbb0] dark:border-red-500/30 bg-[#fdf3f0] dark:bg-red-500/10 px-4 py-3 flex items-start justify-between gap-4 ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-[#c95944] dark:text-red-400 shrink-0 mt-0.5" />
        <p className="text-sm text-[#8a2e1d] dark:text-red-200 leading-relaxed">{message}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#8a2e1d] dark:text-red-200 bg-[#f6dbd3] hover:bg-[#eec8bd] dark:bg-red-500/20 px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="p-1 text-[#8a2e1d] hover:opacity-75 dark:text-red-200"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
