import { memo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';

function RecordBookIcon({ active }) {
  const color = active ? `rgb(var(--color-primary-rgb))` : '#94a3b8';
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      style={{ color }}>
      {/* Left page */}
      <path d="M2 18 L2 6 Q7 3.5 12 6 L12 18 Q7 20.5 2 18 Z"
        fill="currentColor" fillOpacity="0.2"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Right page */}
      <path d="M22 18 L22 6 Q17 3.5 12 6 L12 18 Q17 20.5 22 18 Z"
        fill="currentColor" fillOpacity="0.2"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Center spine */}
      <line x1="12" y1="6" x2="12" y2="18"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Left page lines */}
      <line x1="4.5" y1="9.5"  x2="10.5" y2="10"   stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="4.5" y1="12.5" x2="10.5" y2="13"   stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="4.5" y1="15.5" x2="9"    y2="15.8"  stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      {/* Right page lines */}
      <line x1="13.5" y1="10"   x2="19.5" y2="9.5"  stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="13.5" y1="13"   x2="19.5" y2="12.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="13.5" y1="15.8" x2="18"   y2="15.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

const CONFETTI_PIECES = [
  { offset:  -9, delay:   0, rot: 130, color: '#f97316' },
  { offset:   7, delay: 180, rot: 210, color: '#22d3ee' },
  { offset:  -3, delay: 360, rot: 160, color: '#a78bfa' },
  { offset:  11, delay:  90, rot: 260, color: '#4ade80' },
  { offset: -12, delay: 270, rot:  80, color: '#fb7185' },
  { offset:   2, delay: 450, rot: 310, color: '#fbbf24' },
  { offset:  -6, delay: 580, rot: 190, color: '#60a5fa' },
];

function ConfettiTrophy({ active }) {
  return (
    <span className="relative inline-flex items-center justify-center text-xl" style={{ width: '1.5rem', height: '1.5rem' }}>
      🏆
      {active && CONFETTI_PIECES.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            '--offset': `${p.offset}px`,
            '--delay':  `${p.delay}ms`,
            '--rot':    `${p.rot}deg`,
            '--c':      p.color,
          }}
        />
      ))}
    </span>
  );
}

const TABS = [
  { to: '/',         label: 'Home',    icon: '🏠', end: true,  idleAnim: 'animate-home-pulse'      },
  { to: '/teams',    label: 'Teams',   icon: '👥', end: false, idleAnim: 'animate-teams-wobble'    },
  { to: '/records',  label: 'Records', svg: ConfettiTrophy, end: false, idleAnim: 'animate-trophy-twinkle' },
  { to: '/reports',  label: 'Reports', icon: '📊', end: false, idleAnim: 'animate-chart-float'     },
  { to: '/history',  label: 'History', icon: '📖', end: false, idleAnim: 'animate-book-open'  },
  { to: '/settings', label: 'Settings',icon: '⚙️', end: false, idleAnim: 'animate-gear-spin'      },
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

  const pillWidth = `${100 / TABS.length}%`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-surface border-t border-slate-700 pb-safe">
      <div className="max-w-2xl md:max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto relative flex items-center">
        {/* Sliding pill indicator */}
        {activeIdx >= 0 && (
          <div
            className="absolute top-1 bottom-1 left-0 rounded-lg bg-primary/15 transition-transform duration-200 ease-out pointer-events-none"
            style={{ width: pillWidth, transform: `translateX(${activeIdx * 100}%)` }}
          />
        )}

        {TABS.map((tab) => {
          const SvgIcon = tab.svg ?? null;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) => tabClass(isActive)}
            >
              {({ isActive }) => (
                <>
                  {SvgIcon ? (
                    <span
                      key={String(isActive)}
                      className={isActive ? (tab.idleAnim ?? 'animate-icon-bounce') : ''}
                    >
                      <SvgIcon active={isActive} />
                    </span>
                  ) : (
                    <span
                      key={String(isActive)}
                      className={`text-xl ${isActive ? (tab.idleAnim ?? 'animate-icon-bounce') : ''}`}
                    >
                      {tab.icon}
                    </span>
                  )}
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
