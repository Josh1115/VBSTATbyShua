import { memo } from 'react';

export const EmptyState = memo(function EmptyState({ icon = '📭', iconClassName, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className={`text-5xl mb-3 inline-block${iconClassName ? ` ${iconClassName}` : ''}`}>{icon}</div>
      <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
      {description && <p className="text-slate-400 text-sm mb-4">{description}</p>}
      {action}
    </div>
  );
});
