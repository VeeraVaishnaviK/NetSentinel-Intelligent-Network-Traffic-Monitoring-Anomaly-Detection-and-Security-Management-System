import React from 'react';

export function StatCardSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="ns-card p-4 animate-pulse flex items-center gap-3.5">
          <div className="h-11 w-11 bg-[#dcebf2] dark:bg-slate-800 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-20 bg-[#dcebf2] dark:bg-slate-800 rounded" />
            <div className="h-3 w-28 bg-[#e8f2f7] dark:bg-slate-800/70 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-2.5 p-4 animate-pulse">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="h-9 bg-[#eaf3f8] dark:bg-slate-800/70 rounded-xl" />
      ))}
    </div>
  );
}
