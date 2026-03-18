import { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { exportBackup, importBackup } from '../stats/backup';
import { db } from '../db/schema';
import { useUiStore } from '../store/uiStore';
import { FORMAT } from '../constants';

function useStorageEstimate() {
  const [estimate, setEstimate] = useState(null);

  useEffect(() => {
    if (!navigator.storage?.estimate) return;
    navigator.storage.estimate().then((est) => {
      setEstimate({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
    });
  }, []);

  return estimate;
}

const fmtMB = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

const DEFAULT_MAX_SUBS   = 18;
const DEFAULT_FORMAT     = FORMAT.BEST_OF_3;

const ACCENT_COLORS = [
  { id: 'orange', label: 'Orange', hex: '#f97316', rgb: '249 115 22' },
  { id: 'blue',   label: 'Blue',   hex: '#3b82f6', rgb: '59 130 246' },
  { id: 'green',  label: 'Green',  hex: '#22c55e', rgb: '34 197 94'  },
  { id: 'red',    label: 'Red',    hex: '#ef4444', rgb: '239 68 68'  },
  { id: 'purple', label: 'Purple', hex: '#a855f7', rgb: '168 85 247' },
];

function useMaxSubs() {
  const [maxSubs, setMaxSubsState] = useState(() => {
    const saved = parseInt(localStorage.getItem('vbstat_max_subs'), 10);
    return !isNaN(saved) && saved > 0 ? saved : DEFAULT_MAX_SUBS;
  });
  const save = (val) => {
    const n = Math.max(1, Math.min(99, Number(val)));
    localStorage.setItem('vbstat_max_subs', String(n));
    setMaxSubsState(n);
  };
  return [maxSubs, save];
}

function useDefaultFormat() {
  const [defaultFormat, setDefaultFormatState] = useState(() => {
    const saved = localStorage.getItem('vbstat_default_format');
    return saved === FORMAT.BEST_OF_5 ? FORMAT.BEST_OF_5 : DEFAULT_FORMAT;
  });
  const save = (val) => {
    localStorage.setItem('vbstat_default_format', val);
    setDefaultFormatState(val);
  };
  return [defaultFormat, save];
}

function useAmoledMode() {
  const [amoled, setAmoledState] = useState(() => localStorage.getItem('vbstat_amoled') === '1');
  const save = (val) => {
    localStorage.setItem('vbstat_amoled', val ? '1' : '0');
    document.documentElement.classList.toggle('amoled', val);
    setAmoledState(val);
  };
  return [amoled, save];
}

function useToggleSetting(key) {
  const [val, setVal] = useState(() => localStorage.getItem(key) === '1');
  const save = (next) => { localStorage.setItem(key, next ? '1' : '0'); setVal(next); };
  return [val, save];
}

function useAccentColor() {
  const [accent, setAccent] = useState(() => localStorage.getItem('vbstat_accent') ?? 'orange');
  const save = (id) => {
    const c = ACCENT_COLORS.find((x) => x.id === id) ?? ACCENT_COLORS[0];
    localStorage.setItem('vbstat_accent', id);
    document.documentElement.style.setProperty('--color-primary', c.hex);
    document.documentElement.style.setProperty('--color-primary-rgb', c.rgb);
    setAccent(id);
  };
  return [accent, save];
}

function useCoachName() {
  const [name, setName] = useState(() => localStorage.getItem('vbstat_coach_name') ?? '');
  const save = (val) => { localStorage.setItem('vbstat_coach_name', val); setName(val); };
  return [name, save];
}

const PLAYER_NAME_FORMATS = [
  { id: 'initial_last', label: 'Initial + Last',   example: 'J. Smith'   },
  { id: 'last',         label: 'Last Name',         example: 'Smith'      },
  { id: 'first',        label: 'First Name',        example: 'John'       },
  { id: 'first_last',   label: 'First + Last',      example: 'John Smith' },
  { id: 'nickname',     label: 'Nickname',          example: 'Johnny'     },
];

function usePlayerNameFormat() {
  const [fmt, setFmt] = useState(() => localStorage.getItem('vbstat_player_name_format') ?? 'initial_last');
  const save = (id) => { localStorage.setItem('vbstat_player_name_format', id); setFmt(id); };
  return [fmt, save];
}

function useScoreDetail() {
  const [val, setVal] = useState(() => localStorage.getItem('vbstat_score_detail') ?? 'sets');
  const save = (v) => { localStorage.setItem('vbstat_score_detail', v); setVal(v); };
  return [val, save];
}

function useDefaultTeam() {
  const [defaultTeamId, setDefaultTeamId] = useState(() => {
    const saved = parseInt(localStorage.getItem('vbstat_default_team_id'), 10);
    return !isNaN(saved) ? saved : null;
  });
  const save = (id) => {
    if (id == null) localStorage.removeItem('vbstat_default_team_id');
    else localStorage.setItem('vbstat_default_team_id', String(id));
    setDefaultTeamId(id);
  };
  return [defaultTeamId, save];
}

export function SettingsPage() {
  const showToast    = useUiStore((s) => s.showToast);
  const fileInputRef = useRef(null);
  const [maxSubs, saveMaxSubs]           = useMaxSubs();
  const [defaultFormat, saveDefaultFormat] = useDefaultFormat();

  const [amoled,      saveAmoled]      = useAmoledMode();
  const [accent,      saveAccent]      = useAccentColor();
  const [coachName,     saveCoachName]     = useCoachName();
  const [defaultTeamId,    saveDefaultTeam]    = useDefaultTeam();
  const [scoreDetail,      saveScoreDetail]    = useScoreDetail();
  const [playerNameFormat, savePlayerNameFormat] = usePlayerNameFormat();
  const teams = useLiveQuery(() => db.teams.orderBy('name').toArray(), []);
  const [wakeLock,    saveWakeLock]    = useToggleSetting('vbstat_wake_lock');
  const [hapticOn,    saveHaptic]      = useToggleSetting('vbstat_haptic');
  const [flipLayout,  saveFlipLayout]  = useToggleSetting('vbstat_flip_layout');
  const [confirmClear,   setConfirmClear]   = useState(false);
  const [confirmImport,  setConfirmImport]  = useState(false);
  const [pendingFile,    setPendingFile]    = useState(null);
  const [importing,      setImporting]      = useState(false);

  const { canInstall, isIOS, isInstalled, promptInstall } = useInstallPrompt();
  const storage = useStorageEstimate();

  const usagePct = storage?.quota ? storage.usage / storage.quota : 0;
  const showStorageWarning = usagePct > 0.8;

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleExport() {
    try {
      await exportBackup();
      showToast('Backup exported', 'success');
    } catch (e) {
      showToast('Export failed', 'error');
    }
  }

  function handleImportPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setConfirmImport(true);
    e.target.value = '';
  }

  async function handleImportConfirm() {
    if (!pendingFile) return;
    setImporting(true);
    setConfirmImport(false);
    try {
      await importBackup(pendingFile);
      showToast('Backup imported successfully', 'success');
    } catch (e) {
      showToast(e.message ?? 'Import failed', 'error');
    } finally {
      setImporting(false);
      setPendingFile(null);
    }
  }

  async function handleClearAll() {
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
    });
    showToast('All data cleared', 'info');
    setConfirmClear(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="p-4 space-y-4">

        {/* Storage warning */}
        {showStorageWarning && (
          <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-sm">
            <p className="font-semibold text-red-300">Storage almost full</p>
            <p className="text-red-400 mt-0.5">
              {fmtMB(storage.usage)} MB used of {fmtMB(storage.quota)} MB —
              export a backup and consider clearing old data.
            </p>
          </div>
        )}

        {/* Install banner */}
        {!isInstalled && (canInstall || isIOS) && (
          <section className="bg-surface rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h2 className="font-semibold">Install App</h2>
              <p className="text-xs text-slate-400 mt-0.5">Add VBAPPv.2 to your home screen for the best experience</p>
            </div>
            <div className="p-4">
              {canInstall && (
                <Button className="w-full" onClick={promptInstall}>
                  Add to Home Screen
                </Button>
              )}
              {isIOS && !canInstall && (
                <div className="text-sm text-slate-300 space-y-1">
                  <p>To install on iOS:</p>
                  <ol className="list-decimal list-inside text-slate-400 space-y-1 ml-1">
                    <li>Tap the <span className="text-white font-medium">Share</span> button in Safari</li>
                    <li>Tap <span className="text-white font-medium">Add to Home Screen</span></li>
                    <li>Tap <span className="text-white font-medium">Add</span></li>
                  </ol>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Storage info */}
        {storage && !showStorageWarning && (
          <div className="text-xs text-slate-500 px-1">
            Storage: {fmtMB(storage.usage)} MB used of {fmtMB(storage.quota)} MB
            {' '}({(usagePct * 100).toFixed(1)}%)
          </div>
        )}

        {/* Personalization */}
        <section className="bg-surface rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="font-semibold">Personalization</h2>
          </div>
          <div className="p-4 space-y-5">

            {/* Coach / program name */}
            <div>
              <label className="block text-sm font-medium mb-1">Coach / Program Name</label>
              <div className="text-xs text-slate-400 mb-2">Shown on the home screen header ("by ___")</div>
              <input
                type="text"
                value={coachName}
                onChange={(e) => saveCoachName(e.target.value)}
                placeholder="SHUA"
                maxLength={20}
                className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary placeholder:text-slate-600"
              />
            </div>

            {/* Default team */}
            <div>
              <label className="block text-sm font-medium mb-1">Default Team</label>
              <div className="text-xs text-slate-400 mb-2">Pre-selected in tool pages and session setup</div>
              <select
                value={defaultTeamId ?? ''}
                onChange={(e) => saveDefaultTeam(Number(e.target.value) || null)}
                className="w-full bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary"
              >
                <option value="">No default</option>
                {(teams ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Match card score display */}
            <div>
              <div className="text-sm font-medium mb-0.5">Match Card Scores</div>
              <div className="text-xs text-slate-400 mb-2">How scores appear on match cards</div>
              <div className="flex gap-2">
                {[
                  { val: 'sets',   label: 'Set Count',   example: '●●○' },
                  { val: 'scores', label: 'Set Scores',  example: '25-18 · 25-22' },
                ].map(({ val, label, example }) => (
                  <button
                    key={val}
                    onClick={() => saveScoreDetail(val)}
                    className={`flex-1 py-2 px-2 rounded-lg text-sm font-semibold border transition-colors flex flex-col items-center gap-0.5 ${
                      scoreDetail === val
                        ? 'bg-primary text-white border-primary'
                        : 'bg-bg text-slate-300 border-slate-600 hover:border-slate-400'
                    }`}
                  >
                    <span>{label}</span>
                    <span className={`text-[10px] font-normal font-mono ${scoreDetail === val ? 'text-orange-100/70' : 'text-slate-500'}`}>{example}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Accent color */}
            <div>
              <div className="text-sm font-medium mb-1">Accent Color</div>
              <div className="text-xs text-slate-400 mb-3">Applied to buttons, badges, and highlights throughout the app</div>
              <div className="flex gap-3">
                {ACCENT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => saveAccent(c.id)}
                    className="flex flex-col items-center gap-1.5"
                    title={c.label}
                  >
                    <span
                      className="w-9 h-9 rounded-full block transition-transform"
                      style={{
                        background: c.hex,
                        boxShadow: accent === c.id ? `0 0 0 3px #000, 0 0 0 5px ${c.hex}` : 'none',
                        transform: accent === c.id ? 'scale(1.15)' : 'scale(1)',
                      }}
                    />
                    <span className={`text-[10px] font-semibold ${accent === c.id ? 'text-white' : 'text-slate-500'}`}>
                      {c.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </section>

        {/* Display */}
        <section className="bg-surface rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="font-semibold">Display</h2>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">AMOLED Mode</div>
                <div className="text-xs text-slate-400 mt-0.5">Pure black background — saves battery on OLED screens</div>
              </div>
              <button
                onClick={() => saveAmoled(!amoled)}
                className={`relative w-11 h-6 rounded-full transition-colors ${amoled ? 'bg-primary' : 'bg-slate-600'}`}
                aria-checked={amoled}
                role="switch"
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${amoled ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </div>
        </section>

        {/* Live Match */}
        <section className="bg-surface rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="font-semibold">Live Match</h2>
            <p className="text-xs text-slate-400 mt-0.5">Applied during active stat recording</p>
          </div>
          <div className="p-4 divide-y divide-slate-700/60 space-y-0">

            {/* Keep Screen Awake */}
            <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div>
                <div className="text-sm font-medium">Keep Screen Awake</div>
                <div className="text-xs text-slate-400 mt-0.5">Prevent the screen from sleeping during a match</div>
              </div>
              <button
                onClick={() => saveWakeLock(!wakeLock)}
                className={`relative w-11 h-6 rounded-full transition-colors ${wakeLock ? 'bg-primary' : 'bg-slate-600'}`}
                aria-checked={wakeLock}
                role="switch"
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${wakeLock ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            {/* Haptic Feedback */}
            <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div>
                <div className="text-sm font-medium">Haptic Feedback</div>
                <div className="text-xs text-slate-400 mt-0.5">Brief vibration on each point scored</div>
              </div>
              <button
                onClick={() => saveHaptic(!hapticOn)}
                className={`relative w-11 h-6 rounded-full transition-colors ${hapticOn ? 'bg-primary' : 'bg-slate-600'}`}
                aria-checked={hapticOn}
                role="switch"
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${hapticOn ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            {/* Player name format */}
            <div className="py-3 first:pt-0 last:pb-0">
              <div className="text-sm font-medium mb-0.5">Player Name Format</div>
              <div className="text-xs text-slate-400 mb-3">How names appear on the player badge bar during a match</div>
              <div className="flex flex-col gap-1.5">
                {PLAYER_NAME_FORMATS.map(({ id, label, example }) => (
                  <button
                    key={id}
                    onClick={() => savePlayerNameFormat(id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors ${
                      playerNameFormat === id
                        ? 'bg-primary/20 border-primary text-white'
                        : 'bg-bg border-slate-700 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <span className="font-medium">{label}</span>
                    <span className={`font-mono text-xs ${playerNameFormat === id ? 'text-primary' : 'text-slate-500'}`}>
                      {example}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Flip team layout */}
            <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div>
                <div className="text-sm font-medium">Flip Team Layout</div>
                <div className="text-xs text-slate-400 mt-0.5">Show your team on the right side of the scoreboard</div>
              </div>
              <button
                onClick={() => saveFlipLayout(!flipLayout)}
                className={`relative w-11 h-6 rounded-full transition-colors ${flipLayout ? 'bg-primary' : 'bg-slate-600'}`}
                aria-checked={flipLayout}
                role="switch"
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${flipLayout ? 'translate-x-5' : ''}`} />
              </button>
            </div>

          </div>
        </section>

        {/* Match Rules */}
        <section className="bg-surface rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="font-semibold">Match Rules</h2>
            <p className="text-xs text-slate-400 mt-0.5">Applied to all future matches</p>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Best of Sets</label>
              <div className="flex gap-2">
                {[FORMAT.BEST_OF_3, FORMAT.BEST_OF_5].map((f) => (
                  <button
                    key={f}
                    onClick={() => saveDefaultFormat(f)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors
                      ${defaultFormat === f
                        ? 'bg-primary text-white border-primary'
                        : 'bg-bg text-slate-300 border-slate-600 hover:border-slate-400'
                      }`}
                  >
                    {f === FORMAT.BEST_OF_3 ? 'Best of 3' : 'Best of 5'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Max Substitutions per Set</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  className="w-24 bg-bg border border-slate-600 rounded-lg px-3 py-2 text-white"
                  value={maxSubs}
                  min={1}
                  max={99}
                  onChange={(e) => saveMaxSubs(e.target.value)}
                />
                <span className="text-sm text-slate-400">per set</span>
                {maxSubs !== DEFAULT_MAX_SUBS && (
                  <button
                    className="text-xs text-slate-500 hover:text-slate-300 underline"
                    onClick={() => saveMaxSubs(DEFAULT_MAX_SUBS)}
                  >
                    Reset to {DEFAULT_MAX_SUBS}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Data management */}
        <section className="bg-surface rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <h2 className="font-semibold">Data Management</h2>
          </div>
          <div className="p-4 space-y-3">
            <Button className="w-full" variant="secondary" onClick={handleExport}>
              Export Full Backup (JSON)
            </Button>

            <Button
              className="w-full"
              variant="secondary"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? 'Importing…' : 'Import Backup (JSON)'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportPick}
            />

            <Button className="w-full" variant="danger" onClick={() => setConfirmClear(true)}>
              Clear All Data
            </Button>
          </div>
        </section>

        {/* About */}
        <section className="bg-surface rounded-xl p-4">
          <h2 className="font-semibold mb-1">About</h2>
          <p className="text-sm text-slate-400">VBAPPv.2 — Volleyball Stat Tracker</p>
          <p className="text-xs text-slate-500 mt-1">All data stored locally on this device. No account required.</p>
        </section>

      </div>

      {/* Dialogs */}
      {confirmClear && (
        <ConfirmDialog
          title="Clear All Data"
          message="This will permanently delete all teams, players, matches, and stats. This cannot be undone."
          confirmLabel="Clear Everything"
          danger
          onConfirm={handleClearAll}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      {confirmImport && (
        <ConfirmDialog
          title="Import Backup"
          message="This will REPLACE all existing data with the backup file. This cannot be undone. Export a backup first if you want to preserve current data."
          confirmLabel="Import & Replace"
          danger
          onConfirm={handleImportConfirm}
          onCancel={() => { setConfirmImport(false); setPendingFile(null); }}
        />
      )}
    </div>
  );
}
