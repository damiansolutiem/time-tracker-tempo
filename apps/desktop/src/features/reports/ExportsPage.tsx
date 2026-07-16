import type {
  ReportExportColumn,
  ReportExportField,
  ReportExportValueFormat,
} from '@time-tracker/domain';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  EyeOff,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { appStore } from '../../app/store';
import {
  defaultReportExportColumns,
  definitionFor,
  exportFieldDefinitions,
  exportFormatLabels,
} from './reportExportConfiguration';

export function ExportsPage({
  columns,
  actions,
  onBack,
}: {
  columns: ReportExportColumn[];
  actions: typeof appStore;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(columns);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const lastAddedRowRef = useRef<HTMLDivElement | null>(null);
  const fieldListRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => setDraft(columns), [columns]);
  useEffect(() => {
    if (!lastAddedId) return;
    const frame = window.requestAnimationFrame(() => {
      lastAddedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      lastAddedRowRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [lastAddedId]);

  const invalid = useMemo(() => {
    if (!draft.some((column) => column.visible)) return 'Make at least one export field visible.';
    if (draft.some((column) => !column.header.trim())) return 'Every field needs an output name.';
    const headers = draft
      .filter((column) => column.visible)
      .map((column) => column.header.trim().toLocaleLowerCase());
    const duplicate = headers.find((header, index) => headers.indexOf(header) !== index);
    if (duplicate) return `Output name “${duplicate}” is used more than once.`;
    return null;
  }, [draft]);

  function update(id: string, patch: Partial<ReportExportColumn>) {
    setDraft((current) =>
      current.map((column) => (column.id === id ? { ...column, ...patch } : column)),
    );
    setSaved(false);
  }

  function changeField(id: string, field: ReportExportField) {
    const definition = definitionFor(field);
    update(id, {
      field,
      header: newIds.has(id) ? '' : definition.defaultHeader,
      format: definition.defaultFormat,
    });
  }

  function move(index: number, offset: number) {
    const destination = index + offset;
    if (destination < 0 || destination >= draft.length) return;
    const moving = draft[index]!;
    const row = document.getElementById(`export-column-${moving.id}`);
    const previousTop = row?.getBoundingClientRect().top;
    const next = [...draft];
    [next[index], next[destination]] = [next[destination]!, next[index]!];
    flushSync(() => setDraft(next));
    const movedRow = document.getElementById(`export-column-${moving.id}`);
    const list = fieldListRef.current;
    if (movedRow && list && previousTop !== undefined) {
      list.scrollTop += movedRow.getBoundingClientRect().top - previousTop;
    }
    setSaved(false);
  }

  function add() {
    const definition = exportFieldDefinitions[0]!;
    const id = `column-${Date.now()}-${draft.length}`;
    setDraft((current) => [
      ...current,
      {
        id,
        field: definition.field,
        header: '',
        format: definition.defaultFormat,
        visible: true,
      },
    ]);
    setNewIds((current) => new Set(current).add(id));
    setLastAddedId(id);
    setSaved(false);
  }

  async function save() {
    if (invalid) return;
    setSaving(true);
    setError(null);
    try {
      await actions.updateReportExportColumns(draft);
      setNewIds(new Set());
      setLastAddedId(null);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save export fields.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-10 py-9">
      <header className="mb-7 flex items-start justify-between gap-5">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="mb-4 flex items-center gap-1.5 text-sm font-medium text-surface-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={15} /> Back to Settings
          </button>
          <h1 className="m-0 text-3xl font-semibold tracking-tight">Export configuration</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-surface-muted-foreground">
            Define the columns sent to other systems. This layout is used by report CSV exports and
            the Excel Time entries sheet; Tempo JSON keeps its stable full-data structure. Day
            context fields repeat the matching daily value on each time-entry row.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(defaultReportExportColumns.map((column) => ({ ...column })));
            setNewIds(new Set());
            setLastAddedId(null);
            setSaved(false);
          }}
          className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold hover:bg-surface-muted"
        >
          <RotateCcw size={15} /> Reset defaults
        </button>
      </header>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow)]">
        <div className="grid grid-cols-[48px_68px_minmax(140px,1fr)_minmax(140px,1fr)_minmax(160px,1fr)_48px] gap-3 border-b bg-surface-muted/60 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-surface-muted-foreground">
          <span>Order</span>
          <span>Export</span>
          <span>Tempo field</span>
          <span>Output name</span>
          <span>Format</span>
          <span className="sr-only">Actions</span>
        </div>
        <div
          ref={fieldListRef}
          className="max-h-[calc(100vh-330px)] min-h-44 divide-y overflow-y-auto [overflow-anchor:none]"
        >
          {draft.map((column, index) => {
            const definition = definitionFor(column.field);
            return (
              <div
                key={column.id}
                id={`export-column-${column.id}`}
                ref={column.id === lastAddedId ? lastAddedRowRef : undefined}
                className={`grid grid-cols-[48px_68px_minmax(140px,1fr)_minmax(140px,1fr)_minmax(160px,1fr)_48px] items-center gap-3 px-4 py-3 ${newIds.has(column.id) ? 'bg-primary-container/35 ring-1 ring-inset ring-primary/35' : column.visible ? '' : 'bg-surface-muted/25 opacity-65'}`}
              >
                <div className="flex flex-col items-center">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="grid size-6 place-items-center rounded hover:bg-surface-muted disabled:opacity-20"
                    aria-label={`Move ${column.header} up`}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    disabled={index === draft.length - 1}
                    onClick={() => move(index, 1)}
                    className="grid size-6 place-items-center rounded hover:bg-surface-muted disabled:opacity-20"
                    aria-label={`Move ${column.header} down`}
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => update(column.id, { visible: !column.visible })}
                  className={`flex items-center justify-center rounded-lg px-2 py-2 ${column.visible ? 'bg-primary-container text-primary' : 'bg-surface-muted text-surface-muted-foreground'}`}
                  aria-pressed={column.visible}
                  aria-label={`${column.visible ? 'Hide' : 'Show'} ${column.header} in exports`}
                  title={column.visible ? 'Included in exports' : 'Hidden from exports'}
                >
                  {column.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <div className="min-w-0">
                  {newIds.has(column.id) ? (
                    <span className="mb-1 inline-block rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary-foreground">
                      New field
                    </span>
                  ) : null}
                  <select
                    value={column.field}
                    onChange={(event) =>
                      changeField(column.id, event.target.value as ReportExportField)
                    }
                    className="w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    {exportFieldDefinitions.map((item) => (
                      <option key={item.field} value={item.field}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <input
                    value={column.header}
                    onChange={(event) => update(column.id, { header: event.target.value })}
                    placeholder={
                      newIds.has(column.id)
                        ? 'Enter the new output name'
                        : 'Column name in target system'
                    }
                    className={`min-w-0 w-full rounded-lg border bg-background px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-ring ${!column.header.trim() ? 'border-danger' : ''}`}
                  />
                  {!column.header.trim() ? (
                    <span className="mt-1 block text-[10px] font-medium text-danger">
                      Output name required
                    </span>
                  ) : null}
                </div>
                <select
                  value={column.format}
                  onChange={(event) =>
                    update(column.id, {
                      format: event.target.value as ReportExportValueFormat,
                    })
                  }
                  className="min-w-0 rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  {definition.formats.map((format) => (
                    <option key={format} value={format}>
                      {exportFormatLabels[format]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setDraft((current) => current.filter((item) => item.id !== column.id));
                    setNewIds((current) => {
                      const next = new Set(current);
                      next.delete(column.id);
                      return next;
                    });
                    if (lastAddedId === column.id) setLastAddedId(null);
                    setSaved(false);
                  }}
                  className="ml-auto grid size-8 place-items-center rounded-lg text-danger hover:bg-danger-container"
                  aria-label={`Remove ${column.header}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>
        <footer className="flex items-center justify-between gap-4 border-t bg-surface-muted/35 px-5 py-4">
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-semibold hover:bg-surface-muted"
          >
            <Plus size={15} /> Add field
          </button>
          <div className="flex items-center gap-3">
            {invalid ? <span className="text-xs text-danger">{invalid}</span> : null}
            {error ? <span className="text-xs text-danger">{error}</span> : null}
            {saved ? (
              <span className="text-xs font-medium text-success">Configuration saved</span>
            ) : null}
            <button
              type="button"
              disabled={Boolean(invalid) || saving}
              onClick={() => void save()}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-45"
            >
              <Save size={15} /> {saving ? 'Saving…' : 'Save configuration'}
            </button>
          </div>
        </footer>
      </section>

      <section className="mt-5 rounded-2xl border bg-card p-5">
        <h2 className="m-0 text-base font-semibold">Output preview</h2>
        <p className="mt-1 text-xs text-surface-muted-foreground">
          Column headers will be exported from left to right in this order.
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg border">
          <div className="flex min-w-max divide-x bg-surface-muted/55">
            {draft
              .filter((column) => column.visible)
              .map((column) => (
                <span
                  key={column.id}
                  className="min-w-36 px-3 py-2 font-mono text-xs font-semibold"
                >
                  {column.header || '(unnamed)'}
                </span>
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}
