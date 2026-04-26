import { memo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';

function HomeScoreboardIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: '#f97316' }}>
      {/* Board body */}
      <rect x="1.5" y="4" width="21" height="16" rx="1.5"
        fill="currentColor" fillOpacity="0.15"
        stroke="currentColor" strokeWidth="1.5" />
      {/* Header bar */}
      <rect x="1.5" y="4" width="21" height="4" rx="1.5"
        fill="currentColor" fillOpacity="0.35"
        stroke="none" />
      {/* Center divider */}
      <line x1="12" y1="8" x2="12" y2="20" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      {/* Left score */}
      <rect x="4" y="11" width="3.5" height="5" rx="0.5" fill="currentColor" fillOpacity="0.7" />
      <rect x="8" y="11" width="2" height="5" rx="0.5" fill="currentColor" fillOpacity="0.7" />
      {/* Right score */}
      <rect x="13.5" y="11" width="2" height="5" rx="0.5" fill="currentColor" fillOpacity="0.7" />
      <rect x="16.5" y="11" width="3.5" height="5" rx="0.5" fill="currentColor" fillOpacity="0.7" />
    </svg>
  );
}

function TeamsIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: '#f97316' }}>
      {/* Left person — head */}
      <circle cx="7.5" cy="7" r="2.8"
        fill="currentColor" fillOpacity="0.2"
        stroke="currentColor" strokeWidth="1.4" />
      {/* Left person — shoulders/body */}
      <path d="M1.5 20 C1.5 16 4 13.5 7.5 13.5 C11 13.5 13.5 16 13.5 20"
        fill="currentColor" fillOpacity="0.2"
        stroke="currentColor" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" />
      {/* Right person — head */}
      <circle cx="16.5" cy="7" r="2.8"
        fill="currentColor" fillOpacity="0.2"
        stroke="currentColor" strokeWidth="1.4" />
      {/* Right person — shoulders/body */}
      <path d="M10.5 20 C10.5 16 13 13.5 16.5 13.5 C20 13.5 22.5 16 22.5 20"
        fill="currentColor" fillOpacity="0.2"
        stroke="currentColor" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
    <span className="relative inline-flex items-center justify-center" style={{ width: '28px', height: '28px' }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: '#f97316' }}>
        {/* Cup body */}
        <path d="M 5 2.5 H 19 L 17 11 Q 12 13.5 7 11 Z"
          fill="currentColor" fillOpacity="0.2"
          stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        {/* Left handle */}
        <path d="M 5 4 C 1 5 1 10.5 5 10.5"
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {/* Right handle */}
        <path d="M 19 4 C 23 5 23 10.5 19 10.5"
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {/* Stem */}
        <path d="M 10.5 13 L 10 17 L 14 17 L 13.5 13"
          fill="currentColor" fillOpacity="0.25"
          stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        {/* Base */}
        <rect x="7" y="17" width="10" height="2.5" rx="0.5"
          fill="currentColor" stroke="currentColor" strokeWidth="1" />
      </svg>
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

function HistoryBookIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: '#f97316' }}>
      {/* Left page */}
      <path d="M2 18 L2 6 Q7 3.5 12 6 L12 18 Q7 20.5 2 18 Z"
        fill="currentColor" fillOpacity="0.2"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Right page */}
      <path d="M22 18 L22 6 Q17 3.5 12 6 L12 18 Q17 20.5 22 18 Z"
        fill="currentColor" fillOpacity="0.2"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      {/* Spine */}
      <line x1="12" y1="6" x2="12" y2="18"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      {/* Left page lines */}
      <line x1="4.5" y1="9.5"  x2="10.5" y2="10"  stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="4.5" y1="12.5" x2="10.5" y2="13"  stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="4.5" y1="15.5" x2="9"    y2="15.8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      {/* Right page lines */}
      <line x1="13.5" y1="10"   x2="19.5" y2="9.5"  stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="13.5" y1="13"   x2="19.5" y2="12.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="13.5" y1="15.8" x2="18"   y2="15.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function ClipboardIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: '#f97316' }}>
      {/* Clipboard body */}
      <rect x="4" y="4" width="16" height="18" rx="1.5"
        fill="currentColor" fillOpacity="0.15"
        stroke="currentColor" strokeWidth="1.5" />
      {/* Clip at top */}
      <rect x="8.5" y="2" width="7" height="4" rx="1"
        fill="currentColor" fillOpacity="0.3"
        stroke="currentColor" strokeWidth="1.3" />
      {/* Lines representing content */}
      <line x1="7.5" y1="10" x2="16.5" y2="10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="7.5" y1="13.5" x2="16.5" y2="13.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="7.5" y1="17" x2="13" y2="17" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function SettingsGearIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: '#f97316' }}>
      <path
        fillRule="evenodd"
        fill="currentColor"
        fillOpacity="0.25"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
        d="M10.0,4.8 L10.8,2.6 L13.2,2.6 L14.0,4.8 L15.7,5.5 L17.9,4.5 L19.5,6.2 L18.5,8.3 L19.2,10.0 L21.4,10.8 L21.4,13.2 L19.2,14.0 L18.5,15.7 L19.5,17.9 L17.9,19.5 L15.7,18.5 L14.0,19.2 L13.2,21.4 L10.8,21.4 L10.0,19.2 L8.3,18.5 L6.2,19.5 L4.5,17.9 L5.5,15.7 L4.8,14.0 L2.6,13.2 L2.6,10.8 L4.8,10.0 L5.5,8.3 L4.5,6.2 L6.2,4.5 L8.3,5.5 Z M12,8.5 A3.5,3.5 0 1 1 12,15.5 A3.5,3.5 0 1 1 12,8.5 Z"
      />
    </svg>
  );
}

const TABS = [
  { to: '/',         label: 'Home',    svg: HomeScoreboardIcon, end: true,  idleAnim: 'animate-home-pulse'      },
  { to: '/teams',    label: 'Teams',   svg: TeamsIcon, end: false, idleAnim: 'animate-teams-wobble'    },
  { to: '/records',  label: 'Records', svg: ConfettiTrophy, end: false, idleAnim: 'animate-trophy-twinkle' },
  { to: '/reports',  label: 'Reports', svg: ClipboardIcon, end: false, idleAnim: 'animate-chart-float' },
  { to: '/history',  label: 'History', svg: HistoryBookIcon, end: false, idleAnim: 'animate-book-open'  },
  { to: '/settings', label: 'Settings', svg: SettingsGearIcon, end: false, idleAnim: 'animate-gear-spin' },
];

const tabClass = (isActive) =>
  clsx('flex-1 flex flex-col items-center gap-1 py-2 text-xs transition-colors',
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
          const SvgIcon = tab.svg;
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
                    className={`flex items-center justify-center w-7 h-7 ${isActive ? (tab.idleAnim ?? 'animate-icon-bounce') : ''}`}
                  >
                    <SvgIcon active={isActive} />
                  </span>
                  <span className="text-xs uppercase leading-none">{tab.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
});
