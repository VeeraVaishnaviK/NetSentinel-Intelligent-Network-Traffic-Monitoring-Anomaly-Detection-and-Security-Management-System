import React from 'react';
import { Inbox } from 'lucide-react';

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'No data available',
  description = '',
  action = null,
  compact = false,
}) {
  const DisplayIcon = Icon || Inbox;
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? 'py-8 px-4' : 'py-12 px-6'
      }`}
    >
      <div className="p-3 rounded-2xl bg-[#eef6fa] dark:bg-navy-800 border border-[#cde0ea] dark:border-slate-700 text-[#486d7e] dark:text-slate-400 mb-3">
        <DisplayIcon className="w-6 h-6" />
      </div>
      <h4 className="text-sm font-semibold text-[#1a3342] dark:text-slate-200">{title}</h4>
      {description && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
