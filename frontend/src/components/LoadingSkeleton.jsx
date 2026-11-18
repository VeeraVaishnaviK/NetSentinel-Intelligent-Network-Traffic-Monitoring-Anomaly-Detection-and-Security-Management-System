import React from 'react';

export function StatCardSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="ns-card p-4 animate-pulse">
          <div className="flex justify-between">
            <div className="h-3 w-24 bg-slate-800 rounded" />
            <div className="h-8 w-8 bg-slate-800 rounded-lg" />
          </div>
          <div className="h-6 w-32 bg-slate-800 rounded mt-4" />
          <div className="h-3 w-20 bg-slate-800/70 rounded mt-2" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }) {
  return (
    <div className="space-y-2.5 p-4 animate-pulse">
      {Array.from({ length: rows }).map((_, idx) => (
        <div key={idx} className="h-9 bg-slate-800/70 rounded-lg" />
      ))}
    </div>
  );
}

