import { db } from '../db/schema';

const BACKUP_VERSION = 1;

// Tables that must exist in every backup (present since v1)
const REQUIRED_TABLES = [
  'organizations', 'teams', 'seasons', 'players', 'opponents',
  'matches', 'sets', 'lineups', 'substitutions', 'rallies', 'contacts',
];

// Tables added in later schema versions; absent in older backups → treated as empty
const OPTIONAL_TABLES = ['saved_lineups', 'records', 'practice_sessions'];

const ALL_TABLES = [...REQUIRED_TABLES, ...OPTIONAL_TABLES];

// ── Migration ──────────────────────────────────────────────────────────────────
// Add cases here as BACKUP_VERSION increases.
function migrateBackup(data) {
  const v = data.version ?? 0;
  if (v > BACKUP_VERSION) {
    throw new Error(
      `This backup was created with a newer version of the app (v${v}). ` +
      `Please update the app before importing.`
    );
  }
  // v1 → current: nothing to migrate yet; future versions go here as:
  //   if (v < 2) { data.newField = data.newField ?? defaultValue; data.version = 2; }
  return data;
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportBackup() {
  const data = { version: BACKUP_VERSION, exportedAt: new Date().toISOString() };
  for (const table of ALL_TABLES) {
    data[table] = await db[table].toArray();
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vbappv2-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Import ────────────────────────────────────────────────────────────────────

export async function importBackup(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid file — could not parse JSON.');
  }

  if (!data.version) {
    throw new Error('Invalid backup: missing version field.');
  }

  data = migrateBackup(data);

  const missingTables = REQUIRED_TABLES.filter((t) => !Array.isArray(data[t]));
  if (missingTables.length > 0) {
    throw new Error(`Invalid backup: missing required tables: ${missingTables.join(', ')}`);
  }

  await db.transaction('rw', db.tables, async () => {
    // Clear all tables in reverse dependency order
    for (const table of [...ALL_TABLES].reverse()) {
      await db[table].clear();
    }
    // Bulk-insert preserving original IDs; optional tables may be absent in older backups
    for (const table of ALL_TABLES) {
      const rows = data[table];
      if (Array.isArray(rows) && rows.length > 0) {
        await db[table].bulkAdd(rows);
      }
    }
  });
}
