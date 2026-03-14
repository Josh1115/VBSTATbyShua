import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

// Apply persisted AMOLED mode before first render to avoid flash
if (localStorage.getItem('vbstat_amoled') === '1') {
  document.documentElement.classList.add('amoled');
}
import { seedDevData, patchSeedPositions } from './db/seeds.js';

// Seed dev data if DB is empty, then patch any missing positions
if (import.meta.env.DEV) {
  seedDevData().then(() => patchSeedPositions()).catch(console.error);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
