import type {
  Group,
  HistoryEntry,
  Task,
  TimeEntryCorrectionDraft,
  WorkCategory,
  WorkTag,
} from '@time-tracker/domain';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useModalDialog } from '../../infrastructure/useModalDialog';
import { fromDateTimeInputValue, toDateTimeInputValue } from './dateTimeInput';

export function EntryDialog({
  entry,
  tasks,
  groups,
  categories,
  tags,
  onClose,
  onSave,
}: {
  entry: HistoryEntry;
  tasks: Task[];
  groups: Group[];
  categories: WorkCategory[];
  tags: WorkTag[];
  onClose: () => void;
  onSave: (draft: TimeEntryCorrectionDraft) => Promise<void>;
}) {
  const [taskId, setTaskId] = useState(entry.taskId);
  const [categoryId, setCategoryId] = useState(entry.category?.id ?? '');
  const [tagIds, setTagIds] = useState(() => entry.tags.map((tag) => tag.id));
  const [startedAt, setStartedAt] = useState(toDateTimeInputValue(entry.startedAt));
  const [endedAt, setEndedAt] = useState(entry.endedAt ? toDateTimeInputValue(entry.endedAt) : '');
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalDialog<HTMLFormElement>(onClose, saving);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (entry.endedAt && !endedAt) throw new Error('An ended entry must keep an end time.');
      const nextDraft: TimeEntryCorrectionDraft = {
        taskId,
        categoryId: categoryId || null,
        tagIds,
        startedAt: fromDateTimeInputValue(startedAt, entry.startedAt),
        endedAt: endedAt ? fromDateTimeInputValue(endedAt, entry.endedAt ?? undefined) : null,
        note: entry.note,
        reason,
      };
      const sameTags =
        [...tagIds].sort().join('|') ===
        entry.tags
          .map((tag) => tag.id)
          .sort()
          .join('|');
      if (
        nextDraft.taskId === entry.taskId &&
        nextDraft.categoryId === (entry.category?.id ?? null) &&
        sameTags &&
        nextDraft.startedAt === entry.startedAt &&
        nextDraft.endedAt === entry.endedAt
      )
        throw new Error('Change at least one historical value before saving a correction.');
      await onSave(nextDraft);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update this entry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/20 p-6 backdrop-blur-sm">
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-dialog-title"
        onSubmit={(event) => void submit(event)}
        className="max-h-[calc(100vh-3rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border bg-card p-6 shadow-[var(--shadow)]"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 id="entry-dialog-title" className="m-0 text-xl font-semibold">
              Correct time entry
            </h2>
            <p className="mt-1 text-sm text-surface-muted-foreground">
              This deliberately changes the historical record.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg hover:bg-surface-muted"
            aria-label="Close entry editor"
          >
            <X size={18} />
          </button>
        </div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="entry-task">
          Task
        </label>
        <select
          autoFocus
          id="entry-task"
          value={taskId}
          onChange={(event) => setTaskId(event.target.value)}
          className="mb-4 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm"
        >
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {groups.find((group) => group.id === task.groupId)?.name
                ? `${groups.find((group) => group.id === task.groupId)?.name} · `
                : ''}
              {task.title}
              {task.externalId ? ` [${task.externalId}]` : ''}
              {task.archivedAt ? ' (archived)' : ''}
            </option>
          ))}
        </select>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="entry-category">
          Category snapshot
        </label>
        <select
          id="entry-category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          className="mb-4 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm"
        >
          <option value="">Uncategorized</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.archivedAt ? ' (archived)' : ''}
            </option>
          ))}
        </select>
        <fieldset className="mb-4">
          <legend className="mb-2 text-sm font-medium">Tag snapshots</legend>
          <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto rounded-lg border bg-surface p-2.5">
            {tags.map((tag) => (
              <label
                key={tag.id}
                className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${tagIds.includes(tag.id) ? 'bg-primary-container' : 'bg-card'}`}
              >
                <input
                  type="checkbox"
                  checked={tagIds.includes(tag.id)}
                  onChange={(event) =>
                    setTagIds(
                      event.target.checked
                        ? [...tagIds, tag.id]
                        : tagIds.filter((id) => id !== tag.id),
                    )
                  }
                  className="sr-only"
                />
                {tag.name}
              </label>
            ))}
            {!tags.length ? (
              <span className="text-xs text-surface-muted-foreground">No tags configured.</span>
            ) : null}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="entry-start">
              Started
            </label>
            <input
              id="entry-start"
              type="datetime-local"
              step="1"
              value={startedAt}
              onChange={(event) => setStartedAt(event.target.value)}
              className="w-full rounded-lg border bg-surface px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="entry-end">
              Ended
            </label>
            <input
              id="entry-end"
              type="datetime-local"
              step="1"
              value={endedAt}
              onChange={(event) => setEndedAt(event.target.value)}
              className="w-full rounded-lg border bg-surface px-3 py-2.5 text-sm"
            />
          </div>
        </div>
        {!entry.endedAt && (
          <p className="mt-2 text-xs text-surface-muted-foreground">
            Leave the end blank to keep this timer running.
          </p>
        )}
        <p className="mt-4 rounded-lg bg-surface-muted px-3 py-2 text-xs text-surface-muted-foreground">
          Work notes are managed from the expanded History entry.
        </p>
        <div className="mt-4 rounded-lg border border-warning/35 bg-warning-container/30 p-3">
          <p className="m-0 text-xs font-semibold text-warning">
            This correction changes historical reports and any exports generated afterward.
          </p>
          <label className="mt-3 block text-xs font-medium" htmlFor="entry-correction-reason">
            Correction reason
          </label>
          <textarea
            id="entry-correction-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example: Assigned to the wrong client"
            rows={2}
            className="mt-1 w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm"
          />
          <label className="mt-3 flex items-start gap-2 text-xs leading-5">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-1"
            />
            I understand that reports and future exports for this period can change.
          </label>
        </div>
        {error && (
          <p className="mt-4 rounded-lg bg-danger-container px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-surface-muted"
          >
            Cancel
          </button>
          <button
            disabled={saving || !reason.trim() || !acknowledged}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save correction'}
          </button>
        </div>
      </form>
    </div>
  );
}
