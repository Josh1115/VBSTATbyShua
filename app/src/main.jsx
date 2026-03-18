import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { seedDevData, patchSeedPositions } from './db/seeds.js';

// Apply persisted AMOLED mode before first render to avoid flash
if (localStorage.getItem('vbstat_amoled') === '1') {
  document.documentElement.classList.add('amoled');
}

// Apply persisted accent color before first render
{
  const ACCENTS = {
    orange: { hex: '#f97316', rgb: '249 115 22' },
    blue:   { hex: '#3b82f6', rgb: '59 130 246' },
    green:  { hex: '#22c55e', rgb: '34 197 94'  },
    red:    { hex: '#ef4444', rgb: '239 68 68'  },
    purple: { hex: '#a855f7', rgb: '168 85 247' },
  };
  const saved = localStorage.getItem('vbstat_accent') ?? 'orange';
  const c = ACCENTS[saved] ?? ACCENTS.orange;
  document.documentElement.style.setProperty('--color-primary', c.hex);
  document.documentElement.style.setProperty('--color-primary-rgb', c.rgb);
}

// Seed dev data if DB is empty, then patch any missing positions
if (import.meta.env.DEV) {
  seedDevData().then(() => patchSeedPositions()).catch(console.error);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
