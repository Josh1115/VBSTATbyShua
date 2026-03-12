import { useState, useMemo } from 'react';
import clsx from 'clsx';

/**
 * Sortable stat table.
 *
 * columns: [{ key, label, fmt?, defaultDesc? }]
 * rows:    [{ id, name, ...statValues }]
 */
export function StatTable({ columns, rows }) {
  const [sortKey, setSortKey] = useState(columns[1]?.key ?? columns[0].key);
  const [desc, setDesc] = useState(true);

  function handleSort(key) {
    if (sortKey === key) {
      setDesc((d) => !d);
    } else {
      setSortKey(key);
      setDesc(true);
    }
  }

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a[sortKey] ?? -Infinity;
    const bv = b[sortKey] ?? -Infinity;
    return desc ? bv - av : av - bv;
  }), [rows, sortKey, desc]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className={clsx(
                  'px-2 py-2 text-right font-semibold cursor-pointer select-none whitespace-nowrap',
                  col.key === 'name' && 'text-left',
                  sortKey === col.key ? 'text-primary' : 'text-slate-400'
                )}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1 text-xs">{desc ? '↓' : '↑'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.id}
              className={clsx(
                'border-b border-slate-800',
                i % 2 === 0 ? 'bg-transparent' : 'bg-slate-900/40'
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={clsx(
                    'px-2 py-2 tabular-nums',
                    col.key === 'name' ? 'text-left font-medium' : 'text-right text-slate-300',
                    col.cellClass?.(row[col.key], row)
                  )}
                >
                  {col.fmt ? col.fmt(row[col.key]) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="text-center py-8 text-slate-500">
                No data
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
