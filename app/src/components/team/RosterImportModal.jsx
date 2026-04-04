import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { db } from '../../db/schema';
import { useUiStore, selectShowToast } from '../../store/uiStore';
import { POSITION_KEYS } from '../../constants';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

const TEMPLATE_CSV = `Name,Jersey,Position,Year
Emma Johnson,11,OH,Junior
Sara Smith,7,S,Senior
Mia Lee,3,MB,
Jordan Park,1,L,Freshman
`;

function normalizeHeader(raw) {
  const k = raw.toLowerCase().replace(/[\s_\-#.,()]/g, '');
  if (['name', 'player', 'playername', 'fullname'].includes(k)) return 'name';
  if (['jersey', 'jerseynumber', 'jerseynb', 'number', 'num', 'no'].includes(k) || k === '#') return 'jersey';
  if (['position', 'pos', 'role'].includes(k)) return 'position';
  if (['year', 'grade', 'class'].includes(k)) return 'year';
  return null;
}

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'roster-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function RosterImportModal({ onClose, teamId }) {
  const [step,      setStep]      = useState('upload'); // 'upload' | 'preview'
  const [rows,      setRows]      = useState([]);
  const [parseErrs, setParseErrs] = useState([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);
  const showToast = useUiStore(selectShowToast);

  function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result.trim();
      // Auto-detect delimiter: prefer tab if first line has tabs, else comma
      const firstLine = text.split('\n')[0] ?? '';
      const delimiter = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';

      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        delimiter,
        transformHeader: (h) => h.trim(),
        transform: (v) => (typeof v === 'string' ? v.trim() : v),
      });

      if (!result.data.length) {
        setParseErrs(['No data rows found. Make sure the file has a header row and at least one player.']);
        return;
      }

      // Map raw headers → known fields
      const headerMap = {};
      for (const h of (result.meta.fields ?? [])) {
        const norm = normalizeHeader(h);
        if (norm) headerMap[h] = norm;
      }

      if (!Object.values(headerMap).includes('name')) {
        setParseErrs([
          'Could not find a "Name" column. Make sure the first row is a header row (Name, Jersey, Position). Download the template for the exact format.',
        ]);
        return;
      }

      const parsed = [];
      const errs   = [];
      result.data.forEach((row, i) => {
        const m = {};
        for (const [orig, field] of Object.entries(headerMap)) {
          m[field] = row[orig] ?? '';
        }
        if (!m.name) { errs.push(`Row ${i + 2}: missing name — skipped`); return; }

        const rawPos = (m.position ?? '').toUpperCase();
        const pos    = POSITION_KEYS.includes(rawPos) ? rawPos : 'OH';
        parsed.push({
          name:            m.name,
          jersey_number:   m.jersey ?? '',
          position:        pos,
          posWarn:         !!m.position && !POSITION_KEYS.includes(rawPos),
          year:            m.year ?? '',
          _row:            i + 2,
        });
      });

      setParseErrs(errs);
      setRows(parsed);
      if (parsed.length) setStep('preview');
    };
    reader.readAsText(file);
  }

  async function doImport() {
    setImporting(true);
    try {
      await db.players.bulkAdd(
        rows.map((r) => ({
          team_id:      teamId,
          name:         r.name,
          jersey_number: r.jersey_number,
          position:     r.position,
          year:         r.year || null,
          is_active:    true,
          is_captain:   false,
        }))
      );
      showToast(`Imported ${rows.length} player${rows.length !== 1 ? 's' : ''}`, 'success');
      onClose();
    } catch (err) {
      showToast(`Import failed: ${err.message}`, 'error');
    } finally {
      setImporting(false);
    }
  }

  const POS_CHIP = { S: 'text-blue-300 bg-blue-950/60', OH: 'text-orange-300 bg-orange-950/60', MB: 'text-green-300 bg-green-950/60', OPP: 'text-purple-300 bg-purple-950/60', L: 'text-emerald-300 bg-emerald-950/60', DS: 'text-slate-300 bg-slate-700', RS: 'text-orange-300 bg-orange-950/60' };

  return (
    <Modal
      title="Import Roster"
      onClose={onClose}
      footer={
        step === 'preview' ? (
          <>
            <Button variant="secondary" onClick={() => { setStep('upload'); setRows([]); setParseErrs([]); }}>Back</Button>
            <Button onClick={doImport} disabled={importing || !rows.length}>
              {importing ? 'Importing…' : `Import ${rows.length} Player${rows.length !== 1 ? 's' : ''}`}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        )
      }
    >
      {step === 'upload' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Upload a <strong className="text-white">CSV</strong> or <strong className="text-white">TXT</strong> file with one player per row.
            The first row must be a header row.
          </p>

          {/* Template download */}
          <div className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-white">Download Template</div>
              <div className="text-xs text-slate-400">Pre-formatted CSV with correct headers</div>
            </div>
            <Button size="sm" variant="ghost" onClick={downloadTemplate}>↓ CSV</Button>
          </div>

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            className="border-2 border-dashed border-slate-600 rounded-xl py-10 text-center cursor-pointer
              hover:border-primary hover:bg-primary/5 transition-colors select-none"
          >
            <div className="text-4xl mb-2">📂</div>
            <div className="text-sm font-semibold text-white mb-1">Tap to choose file</div>
            <div className="text-xs text-slate-500">CSV or TXT · comma or tab separated</div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          {/* Format hint */}
          <div className="bg-slate-900 rounded-lg px-4 py-3 font-mono text-xs text-slate-400 space-y-0.5">
            <div className="text-slate-500 mb-1">Required columns (header row):</div>
            <div className="text-slate-300">Name, Jersey, Position</div>
            <div className="text-slate-500 mt-1">Optional:</div>
            <div>Year — Freshman / Sophomore / Junior / Senior</div>
            <div>Positions — OH OPP MB S L DS RS</div>
          </div>

          {parseErrs.length > 0 && (
            <div className="space-y-1">
              {parseErrs.map((e, i) => (
                <div key={i} className="text-sm text-red-400 flex gap-2"><span>⚠</span><span>{e}</span></div>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Ready to import <span className="font-bold text-white">{rows.length}</span> player{rows.length !== 1 ? 's' : ''}.
            Review below, then tap Import.
          </p>

          {parseErrs.length > 0 && (
            <div className="bg-yellow-950/30 border border-yellow-800/40 rounded-lg px-3 py-2 space-y-0.5">
              {parseErrs.map((e, i) => (
                <div key={i} className="text-xs text-yellow-400">⚠ {e}</div>
              ))}
            </div>
          )}

          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {rows.map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 ${r.posWarn ? 'bg-yellow-950/20 border border-yellow-800/30' : 'bg-surface'}`}
              >
                <span className="text-slate-500 font-mono text-xs w-6 text-right shrink-0">
                  {r.jersey_number || '—'}
                </span>
                <span className="flex-1 font-medium text-sm truncate">{r.name}</span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${POS_CHIP[r.position] ?? 'bg-slate-700 text-slate-300'}`}>
                  {r.position}
                  {r.posWarn && ' *'}
                </span>
                {r.year && <span className="text-xs text-slate-500 shrink-0">{r.year}</span>}
              </div>
            ))}
          </div>

          {rows.some((r) => r.posWarn) && (
            <p className="text-xs text-yellow-500">* Position not recognized — defaulted to OH. Edit after import if needed.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
