import { memo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';

const TABS = [
  { to: '/',         label: 'Home',     icon: '🏠', end: true,  idleAnim: 'animate-home-pulse'   },
  { to: '/teams',    label: 'Teams',    icon: '👥', end: false, idleAnim: 'animate-teams-wobble' },
  { to: '/records',  label: 'Records',  icon: '🏆', end: false, idleAnim: 'animate-trophy-twinkle' },
  { to: '/reports',  label: 'Reports',  icon: '📊', end: false, idleAnim: 'animate-chart-float'  },
  { to: '/settings', label: 'Settings', icon: '⚙️', end: false, idleAnim: 'animate-gear-spin'   },
];

const tabClass = (isActive) =>
  clsx('flex-1 flex flex-col items-center py-2 text-xs transition-colors',
    isActive ? 'text-primary' : 'text-slate-400');

export const NavBar = memo(function NavBar() {
  const { pathname } = useLocation();

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
                    className={`text-xl ${isActive ? (tab.idleAnim ?? 'animate-icon-bounce') : ''}`}
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
