import React from 'react';
import EmptyState from './EmptyState';

export default function DataTable({
  columns = [],
  rows = [],
  keyField = 'id',
  onRowClick = null,
  selectedRowKey = null,
  emptyTitle = 'No records available',
  emptyDescription = 'No matching data has been recorded yet.',
  emptyIcon = null,
  compact = false,
}) {
  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        compact
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-[#d6e6ef] dark:border-slate-800 bg-[#f2f8fb] dark:bg-navy-900/70">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${compact ? 'px-3.5 py-2.5' : 'px-4 py-3'} text-[11px] font-semibold uppercase tracking-wider text-[#466373] dark:text-slate-400 whitespace-nowrap ${
                  col.align === 'right' ? 'text-right' : 'text-left'
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#e4eff5] dark:divide-slate-800/70">
          {rows.map((row, idx) => {
            const rowKey = row[keyField] ?? idx;
            const isSelected = selectedRowKey !== null && selectedRowKey === rowKey;
            return (
              <tr
                key={rowKey}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`transition-colors ${
                  onRowClick
                    ? 'cursor-pointer hover:bg-[#eef6fa] dark:hover:bg-navy-800/70'
                    : 'hover:bg-[#f6fafc] dark:hover:bg-navy-800/40'
                } ${isSelected ? 'bg-[#dcebf2]/80 dark:bg-sky-500/15' : ''}`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`${compact ? 'px-3.5 py-2.5' : 'px-4 py-3'} text-sm text-slate-700 dark:text-slate-200 ${
                      col.mono ? 'font-mono text-xs' : ''
                    } ${col.align === 'right' ? 'text-right' : 'text-left'} ${
                      col.className || ''
                    }`}
                  >
                    {col.render ? col.render(row) : row[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
