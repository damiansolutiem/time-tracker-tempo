import type { Group, GroupDraft } from '@time-tracker/domain';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useModalDialog } from '../../infrastructure/useModalDialog';
import { taskColors } from '../tasks/taskColors';

export function GroupDialog({
  group,
  onClose,
  onSave,
}: {
  group: Group | null;
  onClose: () => void;
  onSave: (draft: GroupDraft) => Promise<void>;
}) {
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [color, setColor] = useState(group?.color ?? 'blue');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalDialog<HTMLFormElement>(onClose, saving);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ name, description: description || null, color });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this group.');
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
        aria-labelledby="group-dialog-title"
        onSubmit={(event) => void submit(event)}
        className="max-h-[calc(100vh-3rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-2xl border bg-card p-6 shadow-[var(--shadow)]"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 id="group-dialog-title" className="m-0 text-xl font-semibold">
              {group ? 'Edit group' : 'Create a group'}
            </h2>
            <p className="mt-1 text-sm text-surface-muted-foreground">
              Use groups for clients, departments, projects, or cost centers.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg hover:bg-surface-muted"
            aria-label="Close group form"
          >
            <X size={18} />
          </button>
        </div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="group-name">
          Name
        </label>
        <input
          id="group-name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Acme Ltd, Marketing, Project Atlas…"
          className="mb-4 w-full rounded-lg border bg-surface px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <label className="mb-1.5 block text-sm font-medium" htmlFor="group-description">
          Description
        </label>
        <textarea
          id="group-description"
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
                  name="group-color"
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
        {error ? (
          <p className="rounded-lg bg-danger-container px-3 py-2 text-sm text-danger">{error}</p>
        ) : null}
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
            {saving ? 'Saving…' : group ? 'Save changes' : 'Create group'}
          </button>
        </div>
      </form>
    </div>
  );
}
