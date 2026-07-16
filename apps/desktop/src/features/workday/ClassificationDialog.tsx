import type {
  WorkdayClassification,
  WorkdayClassificationCategory,
  WorkdayClassificationDraft,
} from '@time-tracker/domain';
import { Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useModalDialog } from '../../infrastructure/useModalDialog';
import { fromDateTimeInputValue, toDateTimeInputValue } from '../history/dateTimeInput';
import { classificationDescriptions, classificationLabels } from './classificationLabels';

export function ClassificationDialog({
  classification,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  classification?: WorkdayClassification;
  initial?: WorkdayClassificationDraft;
  onClose: () => void;
  onSave: (draft: WorkdayClassificationDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const source = classification ?? initial!;
  const [category, setCategory] = useState(source.category);
  const [startedAt, setStartedAt] = useState(toDateTimeInputValue(source.startedAt));
  const [endedAt, setEndedAt] = useState(
    source.endedAt ? toDateTimeInputValue(source.endedAt) : '',
  );
  const [note, setNote] = useState(source.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalDialog<HTMLFormElement>(onClose, saving);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        category,
        startedAt: fromDateTimeInputValue(startedAt, source.startedAt),
        endedAt: endedAt ? fromDateTimeInputValue(endedAt, source.endedAt ?? undefined) : null,
        note,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this classification.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!onDelete || !window.confirm('Delete this classification?')) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete this classification.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/20 p-6 backdrop-blur-sm">
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="classification-dialog-title"
        aria-describedby="classification-dialog-description"
        onSubmit={(event) => void submit(event)}
        className="max-h-[calc(100vh-3rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border bg-card p-6 shadow-[var(--shadow)]"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 id="classification-dialog-title" className="m-0 text-xl font-semibold">
              {classification ? 'Edit gap classification' : 'Classify current gap'}
            </h2>
            <p
              id="classification-dialog-description"
              className="mt-1 text-sm text-surface-muted-foreground"
            >
              Classifications explain non-worked time. Only ignored time reduces the schedule.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg hover:bg-surface-muted"
            aria-label="Close classification editor"
          >
            <X size={18} />
          </button>
        </div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="classification-category">
          Classification
        </label>
        <select
          autoFocus
          id="classification-category"
          aria-describedby="classification-category-help"
          value={category}
          onChange={(event) => setCategory(event.target.value as WorkdayClassificationCategory)}
          className="mb-4 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm"
        >
          {Object.entries(classificationLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p
          id="classification-category-help"
          className="-mt-2 mb-4 text-xs leading-5 text-surface-muted-foreground"
        >
          {classificationDescriptions[category]}
        </p>
        <div className="grid grid-cols-2 gap-4">
          <label className="text-sm font-medium">
            Started
            <input
              required
              type="datetime-local"
              step="1"
              value={startedAt}
              onChange={(event) => setStartedAt(event.target.value)}
              className="mt-1.5 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Ended
            <input
              type="datetime-local"
              step="1"
              value={endedAt}
              onChange={(event) => setEndedAt(event.target.value)}
              className="mt-1.5 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm"
            />
          </label>
        </div>
        <label className="mt-4 mb-1.5 block text-sm font-medium" htmlFor="classification-note">
          Note (optional)
        </label>
        <textarea
          id="classification-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          className="w-full resize-none rounded-lg border bg-surface px-3 py-2.5 text-sm"
          placeholder="What happened during this time?"
        />
        {error ? (
          <p className="mt-4 rounded-lg bg-danger-container px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex items-center justify-between gap-2">
          {onDelete ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void remove()}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger-container"
            >
              <Trash2 size={15} /> Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-surface-muted"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
