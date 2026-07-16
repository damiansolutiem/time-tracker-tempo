import type { WorkCategory, WorkLabelDraft, WorkTag } from '@time-tracker/domain';
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';

type Label = WorkCategory;

type ManagerProps = {
  kind: 'category' | 'tag';
  active: Label[];
  archived: Label[];
  onCreate: (draft: WorkLabelDraft) => Promise<unknown>;
  onUpdate: (id: string, draft: WorkLabelDraft) => Promise<void>;
  onArchive: (id: string, archived: boolean) => Promise<void>;
};

const colors = ['green', 'blue', 'amber', 'red'] as const;

function LabelManager({ kind, active, archived, onCreate, onUpdate, onArchive }: ManagerProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>('green');
  const [editing, setEditing] = useState<Label | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = kind === 'category' ? 'Category' : 'Tag';

  async function perform(operation: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await operation();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 rounded-xl border bg-surface/45 p-4">
      <h3 className="m-0 text-sm font-semibold">{label}s</h3>
      <p className="mt-1 text-xs leading-5 text-surface-muted-foreground">
        {kind === 'category'
          ? 'One category per entry; totals reconcile with all tracked time.'
          : 'Multiple tags per entry; tag totals may overlap.'}
      </p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          void perform(() => onCreate({ name, color })).then((saved) => {
            if (saved) setName('');
          });
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={`New ${kind}`}
          aria-label={`New ${kind} name`}
          className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2 text-sm"
        />
        <select
          value={color ?? ''}
          onChange={(event) => setColor(event.target.value || null)}
          aria-label={`New ${kind} color`}
          className="rounded-lg border bg-card px-2 py-2 text-xs"
        >
          <option value="">No color</option>
          {colors.map((item) => (
            <option key={item} value={item}>
              {item[0]!.toUpperCase() + item.slice(1)}
            </option>
          ))}
        </select>
        <button
          disabled={busy || !name.trim()}
          className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-45"
          aria-label={`Add ${kind}`}
        >
          <Plus size={15} />
        </button>
      </form>
      {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
      <div className="mt-4 max-h-52 space-y-1 overflow-y-auto pr-1">
        {[...active, ...archived].map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
          >
            {editing?.id === item.id ? (
              <form
                className="flex min-w-0 flex-1 gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void perform(() =>
                    onUpdate(item.id, { name: editingName, color: item.color }),
                  ).then((saved) => {
                    if (saved) setEditing(null);
                  });
                }}
              >
                <input
                  autoFocus
                  value={editingName}
                  onChange={(event) => setEditingName(event.target.value)}
                  className="min-w-0 flex-1 rounded border bg-surface px-2 py-1 text-xs"
                />
                <button className="text-xs font-semibold text-primary">Save</button>
              </form>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {item.name}
                  {item.archivedAt ? (
                    <span className="ml-1 text-[10px] text-surface-muted-foreground">Archived</span>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(item);
                    setEditingName(item.name);
                  }}
                  className="grid size-7 place-items-center rounded hover:bg-surface-muted"
                  aria-label={`Rename ${item.name}`}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void perform(() => onArchive(item.id, !item.archivedAt))}
                  className="grid size-7 place-items-center rounded hover:bg-surface-muted"
                  aria-label={`${item.archivedAt ? 'Restore' : 'Archive'} ${item.name}`}
                >
                  {item.archivedAt ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                </button>
              </>
            )}
          </div>
        ))}
        {!active.length && !archived.length ? (
          <p className="m-0 py-3 text-center text-xs text-surface-muted-foreground">
            No {kind}s yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function TaxonomySettings({
  categories,
  archivedCategories,
  tags,
  archivedTags,
  actions,
}: {
  categories: WorkCategory[];
  archivedCategories: WorkCategory[];
  tags: WorkTag[];
  archivedTags: WorkTag[];
  actions: {
    createCategory(draft: WorkLabelDraft): Promise<unknown>;
    updateCategory(id: string, draft: WorkLabelDraft): Promise<void>;
    archiveCategory(id: string, archived: boolean): Promise<void>;
    createTag(draft: WorkLabelDraft): Promise<unknown>;
    updateTag(id: string, draft: WorkLabelDraft): Promise<void>;
    archiveTag(id: string, archived: boolean): Promise<void>;
  };
}) {
  return (
    <section
      aria-label="Category and tag management"
      className="mt-8 rounded-2xl border bg-card p-7"
    >
      <div className="grid grid-cols-2 gap-4">
        <LabelManager
          kind="category"
          active={categories}
          archived={archivedCategories}
          onCreate={(draft) => actions.createCategory(draft)}
          onUpdate={(id, draft) => actions.updateCategory(id, draft)}
          onArchive={(id, archived) => actions.archiveCategory(id, archived)}
        />
        <LabelManager
          kind="tag"
          active={tags}
          archived={archivedTags}
          onCreate={(draft) => actions.createTag(draft)}
          onUpdate={(id, draft) => actions.updateTag(id, draft)}
          onArchive={(id, archived) => actions.archiveTag(id, archived)}
        />
      </div>
    </section>
  );
}
