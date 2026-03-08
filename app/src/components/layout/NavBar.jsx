import { memo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { MATCH_STATUS } from '../../constants';
import clsx from 'clsx';

const TABS = [
  { to: '/',         label: 'Home',     icon: '🏠', end: true },
  { to: '/teams',    label: 'Teams',    icon: '👥', end: false },
  null, // FAB slot
  { to: '/reports',  label: 'Reports',  icon: '📊', end: false },
  { to: '/settings', label: 'Settings', icon: '⚙️', end: false },
];

const tabClass = (isActive) =>
  clsx('flex-1 flex flex-col items-center py-2 text-xs transition-colors',
    isActive ? 'text-primary' : 'text-slate-400');

export const NavBar = memo(function NavBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const hasActiveMatch = useLiveQuery(
    () => db.matches.where('status').equals(MATCH_STATUS.IN_PROGRESS).count().then((c) => c > 0),
    []
  );

  const activeIdx = TABS.findIndex((tab) => {
    if (!tab) return false;
    if (tab.end) return pathname === tab.to;
    return pathname.startsWith(tab.to);
  });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-slate-700 pb-safe">
      <div className="max-w-2xl mx-auto relative flex items-center">
        {/* Sliding pill indicator */}
        {activeIdx >= 0 && (
          <div
            className="absolute top-1 bottom-1 left-0 w-1/5 rounded-lg bg-primary/15 transition-transform duration-200 ease-out pointer-events-none"
            style={{ transform: `translateX(${activeIdx * 100}%)` }}
          />
        )}

        {TABS.map((tab, i) => {
          if (!tab) {
            return (
              <div key="fab" className="flex-1 flex justify-center">
                <button
                  onClick={() => navigate('/matches/new')}
                  className={`w-14 h-14 -mt-4 rounded-full bg-primary text-white text-2xl flex items-center justify-center shadow-lg active:scale-95 group${hasActiveMatch === false ? ' fab-glow' : ''}`}
                  aria-label="New Match"
                >
                  <span className="inline-block transition-transform duration-200 group-active:rotate-45">+</span>
                </button>
              </div>
            );
          }
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) => tabClass(isActive)}
            >
              {({ isActive }) => (
                <>
                  <span
                    key={String(isActive)}
                    className={`text-xl${isActive ? ' animate-icon-bounce' : ''}`}
                  >
                    {tab.icon}
                  </span>
                  {tab.label}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
});
