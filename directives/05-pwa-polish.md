# Directive 05 — PWA Polish

## Responsibility
Own `vite.config.js` PWA config, `public/manifest.json`, `public/sw.js`, `app/src/hooks/useInstallPrompt.js`, and `app/src/stats/backup.js`.

## PWA Manifest (public/manifest.json)
```json
{
  "name": "VBAPPv.2",
  "short_name": "VBAPPv2",
  "description": "Volleyball stat tracking app",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0f172a",
  "theme_color": "#f97316",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/apple-touch-icon.png", "sizes": "180x180", "type": "image/png" }
  ]
}
```

## Workbox Caching Strategy
- App shell (HTML/JS/CSS): CacheFirst, cache name `app-shell-v1`
- Fonts and icons: CacheFirst, maxAgeSeconds: 30 days
- IndexedDB: managed by browser, no SW involvement needed
- Offline fallback: NetworkFirst for navigation → serve offline.html if network fails

## Install Prompt (iOS + Android)
- Android/Chrome: capture `beforeinstallprompt` event in `useInstallPrompt` hook
- Show InstallBanner at top of SettingsPage
- iOS Safari: no API — show manual instructions: "Tap Share → Add to Home Screen"
- Detect iOS: `navigator.userAgent` includes 'iPhone' or 'iPad'

## Full JSON Backup (backup.js)
Export:
```js
const backup = {
  version: 1,
  exportedAt: new Date().toISOString(),
  organizations: await db.organizations.toArray(),
  teams: await db.teams.toArray(),
  seasons: await db.seasons.toArray(),
  players: await db.players.toArray(),
  opponents: await db.opponents.toArray(),
  matches: await db.matches.toArray(),
  sets: await db.sets.toArray(),
  lineups: await db.lineups.toArray(),
  substitutions: await db.substitutions.toArray(),
  rallies: await db.rallies.toArray(),
  contacts: await db.contacts.toArray(),
};
// Trigger download as vbappv2-backup-YYYY-MM-DD.json
```

Import:
- Parse JSON file, validate `version` field
- Clear all tables (with confirmation)
- Bulk-insert all records preserving IDs

## Storage Warning
- On app start, call `navigator.storage.estimate()`
- If usage > 80% of quota, show persistent warning banner
- Display: "X MB used of Y MB"

## Lighthouse PWA Checklist
- [ ] manifest.json linked in index.html
- [ ] theme-color meta tag in index.html
- [ ] Service worker registered via vite-plugin-pwa
- [ ] All icons present (192, 512, apple-touch)
- [ ] HTTPS (required for install — will work on localhost for dev)
- [ ] offline.html serves on navigation failure
