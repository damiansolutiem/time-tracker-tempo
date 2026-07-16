import type { Group, Task, TaskDraft, WorkCategory, WorkTag } from '@time-tracker/domain';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useModalDialog } from '../../infrastructure/useModalDialog';
import { taskColors } from './taskColors';

export function TaskDialog({
  task,
  groups,
  categories,
  tags,
  onClose,
  onSave,
}: {
  task: Task | null;
  groups: Group[];
  categories: WorkCategory[];
  tags: WorkTag[];
  onClose: () => void;
  onSave: (draft: TaskDraft) => Promise<void>;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [externalId, setExternalId] = useState(task?.externalId ?? '');
  const [groupId, setGroupId] = useState(task?.groupId ?? '');
  const [categoryId, setCategoryId] = useState(task?.category?.id ?? '');
  const [tagIds, setTagIds] = useState(() => task?.tags.map((tag) => tag.id) ?? []);
  const [description, setDescription] = useState(task?.description ?? '');
  const [color, setColor] = useState(task?.color ?? 'green');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalDialog<HTMLFormElement>(onClose, saving);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        externalId: externalId || null,
        groupId: groupId || null,
        categoryId: categoryId || null,
        tagIds,
        title,
        description: description || null,
        color,
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this task.');
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
        aria-labelledby="task-dialog-title"
        onSubmit={(event) => void submit(event)}
        className="max-h-[calc(100vh-3rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border bg-card p-6 text-card-foreground shadow-[var(--shadow)]"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 id="task-dialog-title" className="m-0 text-xl font-semibold">
              {task ? 'Edit task' : 'Create a task'}
            </h2>
            <p className="mt-1 text-sm text-surface-muted-foreground">
              Tasks organize every recorded time entry.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg hover:bg-surface-muted"
            aria-label="Close task form"
          >
            <X size={18} />
          </button>
        </div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="task-title">
          Title
        </label>
        <input
          id="task-title"
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What are you working on?"
          className="mb-4 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <label className="mb-1.5 block text-sm font-medium" htmlFor="task-id">
          Task ID <span className="font-normal text-surface-muted-foreground">(optional)</span>
        </label>
        <input
          id="task-id"
          value={externalId}
          onChange={(event) => setExternalId(event.target.value)}
          placeholder="e.g. ACME-104"
          className="mb-1 w-full rounded-lg border bg-surface px-3 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="mt-0 mb-4 text-xs text-surface-muted-foreground">
          Letters, numbers, dots, dashes, and underscores. Leave blank if you do not need one.
        </p>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="task-group">
          Group
        </label>
        <select
          id="task-group"
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          className="mb-4 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm"
        >
          <option value="">Ungrouped</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
              {group.archivedAt ? ' (archived)' : ''}
            </option>
          ))}
        </select>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="task-category">
          Category
        </label>
        <select
          id="task-category"
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
          <legend className="mb-2 text-sm font-medium">Tags</legend>
          {tags.length ? (
            <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto rounded-lg border bg-surface p-2.5">
              {tags.map((tag) => (
                <label
                  key={tag.id}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${tagIds.includes(tag.id) ? 'bg-primary-container text-primary-container-foreground' : 'bg-card'}`}
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
                  {tag.archivedAt ? ' (archived)' : ''}
                </label>
              ))}
            </div>
          ) : (
            <p className="m-0 text-xs text-surface-muted-foreground">
              Create tags in Settings to assign reusable labels.
            </p>
          )}
        </fieldset>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="task-description">
          Description
        </label>
        <textarea
          id="task-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optional context"
          rows={3}
          className="mb-4 w-full resize-none rounded-lg border bg-surface px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <fieldset className="mb-5">
          <legend className="mb-2 text-sm font-medium">Color</legend>
          <div className="flex gap-2">
            {taskColors.map((option) => (
              <label
                key={option.value}
                className={`grid size-9 cursor-pointer place-items-center rounded-lg border ${color === option.value ? 'ring-2 ring-ring' : ''}`}
                title={option.label}
              >
                <input
                  type="radio"
                  name="color"
                  value={option.value}
                  checked={color === option.value}
                  onChange={() => setColor(option.value)}
                  className="sr-only"
                />
                <span className={`size-3 rounded-full ${option.className}`} />
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className="rounded-lg bg-danger-container px-3 py-2 text-sm text-danger">{error}</p>
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
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {saving ? 'Saving…' : task ? 'Save changes' : 'Create task'}
          </button>
        </div>
      </form>
    </div>
  );
}
