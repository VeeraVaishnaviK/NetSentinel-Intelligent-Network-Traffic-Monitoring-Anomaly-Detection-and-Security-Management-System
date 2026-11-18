import React from 'react';

export default function ChartCard({
  title,
  subtitle,
  action,
  children,
  className = '',
}) {
  return (
    <div className={`ns-card p-5 flex flex-col ${className}`}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-[15px] font-bold text-[#1a3342] dark:text-slate-100">{title}</h3>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
