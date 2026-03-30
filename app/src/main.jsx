import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { seedDevData, patchSeedPositions } from './db/seeds.js';
import { STORAGE_KEYS, getBoolStorage, getStorageItem } from './utils/storage.js';
import { ACCENT_COLORS } from './constants/index.js';

// Apply persisted AMOLED mode before first render to avoid flash
if (getBoolStorage(STORAGE_KEYS.AMOLED)) {
  document.documentElement.classList.add('amoled');
}

// Apply persisted accent color before first render
{
  const saved = getStorageItem(STORAGE_KEYS.ACCENT, 'orange');
  const c = ACCENT_COLORS.find((a) => a.id === saved) ?? ACCENT_COLORS[0];
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
