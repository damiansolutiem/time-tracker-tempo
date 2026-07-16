import { FileSpreadsheet, Upload, X } from 'lucide-react';
import { useEffect, useState, type ChangeEvent } from 'react';
import type { appStore } from '../../app/store';
import {
  parseDelimitedTasks,
  parseTaskWorkbook,
  type TaskImportResult,
  type TaskImportRow,
} from './taskTransfer';

export function TaskImportDialog({
  actions,
  onClose,
}: {
  actions: typeof appStore;
  onClose: () => void;
}) {
  const [source, setSource] = useState('');
  const [rows, setRows] = useState<TaskImportRow[]>([]);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<TaskImportResult | null>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !importing) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [importing, onClose]);

  function parsePaste() {
    setError(null);
    setResult(null);
    try {
      const parsed = parseDelimitedTasks(source);
      if (!parsed.length) throw new Error('No task rows were found.');
      setRows(parsed);
      setSourceName('pasted data');
    } catch (caught) {
      setRows([]);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const parsed = file.name.toLowerCase().endsWith('.xlsx')
        ? await parseTaskWorkbook(await file.arrayBuffer())
        : parseDelimitedTasks(await file.text());
      if (!parsed.length) throw new Error('No task rows were found.');
      setRows(parsed);
      setSourceName(file.name);
    } catch (caught) {
      setRows([]);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function importRows() {
    setImporting(true);
    setError(null);
    try {
      const next = await actions.importTasks(rows);
      setResult(next);
      setRows([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/20 p-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !importing) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-tasks-title"
        className="max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border bg-card p-6 shadow-[var(--shadow)]"
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="import-tasks-title" className="m-0 text-xl font-semibold">
              Import tasks
            </h2>
            <p className="mt-1 text-sm text-surface-muted-foreground">
              Import CSV/XLSX or paste cells copied from Excel. Required column: title.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="grid size-8 place-items-center rounded-lg hover:bg-surface-muted"
            aria-label="Close import"
          >
            <X size={18} />
          </button>
        </header>

        <div className="mb-4 flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-background px-3.5 py-2 text-sm font-semibold hover:bg-surface-muted">
            <Upload size={16} /> Choose CSV or Excel
            <input
              type="file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(event) => void chooseFile(event)}
            />
          </label>
          <span className="text-xs text-surface-muted-foreground">or paste a table below</span>
        </div>
        <label htmlFor="task-import-paste" className="sr-only">
          Paste tasks from CSV or a spreadsheet
        </label>
        <textarea
          id="task-import-paste"
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            setRows([]);
            setResult(null);
          }}
          rows={7}
          placeholder={
            'task_id\ttitle\tgroup\tdescription\tcolor\tstatus\nACME-104\tWebsite update\tAcme\tHomepage work\tgreen\tactive'
          }
          className="w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="m-0 text-xs text-surface-muted-foreground">
            Columns: task_id, title, group/client/department, category, tags, description, color,
            status. Separate tags with | or ;. Unknown groups, categories, and tags are created.
          </p>
          <button
            type="button"
            disabled={!source.trim()}
            onClick={parsePaste}
            className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-45"
          >
            Preview pasted rows
          </button>
        </div>

        {rows.length ? (
          <div className="mt-5 overflow-hidden rounded-xl border">
            <div className="flex items-center gap-2 bg-surface-muted px-4 py-2.5 text-sm font-semibold">
              <FileSpreadsheet size={16} /> {rows.length} {rows.length === 1 ? 'task' : 'tasks'}{' '}
              ready from {sourceName}
            </div>
            <div className="max-h-40 divide-y overflow-auto">
              {rows.slice(0, 8).map((row) => (
                <div
                  key={row.rowNumber}
                  className="grid grid-cols-[90px_minmax(0,1fr)_140px] gap-3 px-4 py-2 text-xs"
                >
                  <span className="truncate font-mono text-surface-muted-foreground">
                    {row.externalId || 'no task ID'}
                  </span>
                  <span className="truncate font-medium">{row.title || 'Missing title'}</span>
                  <span className="truncate text-surface-muted-foreground">
                    {row.groupName || 'Ungrouped'}
                  </span>
                </div>
              ))}
              {rows.length > 8 ? (
                <div className="px-4 py-2 text-xs text-surface-muted-foreground">
                  and {rows.length - 8} more…
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {result ? (
          <div
            className={`mt-5 rounded-lg px-4 py-3 text-sm ${result.errors.length ? 'bg-warning-container text-warning' : 'bg-success-container text-success'}`}
          >
            <p className="m-0 font-semibold">
              Imported {result.imported} tasks
              {result.groupsCreated ? ` and created ${result.groupsCreated} groups` : ''}.
              {result.categoriesCreated ? ` Created ${result.categoriesCreated} categories.` : ''}
              {result.tagsCreated ? ` Created ${result.tagsCreated} tags.` : ''}
            </p>
            {result.errors.length ? (
              <div className="mt-2 max-h-28 overflow-auto text-xs">
                {result.errors.map((item) => (
                  <p key={`${item.rowNumber}-${item.message}`} className="my-1">
                    Row {item.rowNumber}: {item.message}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p className="mt-5 rounded-lg bg-danger-container px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <footer className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-surface-muted"
          >
            {result ? 'Done' : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={!rows.length || importing}
            onClick={() => void importRows()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-45"
          >
            {importing ? 'Importing…' : `Import ${rows.length || ''} tasks`}
          </button>
        </footer>
      </section>
    </div>
  );
}
