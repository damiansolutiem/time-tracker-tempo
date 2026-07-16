import type { Group, GroupDraft, Task } from '@time-tracker/domain';
import { Archive, ArchiveRestore, FolderKanban, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import type { appStore } from '../../app/store';
import { taskColorClass } from '../tasks/taskColors';
import { GroupDialog } from './GroupDialog';

export function GroupsPage({
  groups,
  archivedGroups,
  tasks,
  actions,
}: {
  groups: Group[];
  archivedGroups: Group[];
  tasks: Task[];
  actions: typeof appStore;
}) {
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Group | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const source = showArchived ? archivedGroups : groups;

  async function perform(operation: () => Promise<void>) {
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The group could not be updated.');
    }
  }

  async function save(draft: GroupDraft) {
    if (editing) await actions.updateGroup(editing.id, draft);
    else await actions.createGroup(draft);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-10 py-9">
      <header className="mb-7 flex items-start justify-between">
        <div>
          <h1 className="m-0 text-3xl font-semibold tracking-tight">Groups</h1>
          <p className="mt-2 text-sm text-surface-muted-foreground">
            Organize tasks by client, department, project, or any other context.
          </p>
        </div>
        <button
          onClick={() => setEditing(null)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm"
        >
          <Plus size={16} /> New group
        </button>
      </header>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowArchived(!showArchived)}
          className="rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-surface-muted"
        >
          {showArchived ? 'Active groups' : `Archived (${archivedGroups.length})`}
        </button>
      </div>
      {error ? (
        <p className="rounded-lg bg-danger-container px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}
      <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
        {source.map((group) => {
          const count = tasks.filter((task) => task.groupId === group.id).length;
          return (
            <div key={group.id} className="flex items-center gap-4 px-5 py-4">
              <span className={`size-3 rounded-full ${taskColorClass(group.color)}`} />
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-medium">{group.name}</p>
                <p className="mt-1 truncate text-xs text-surface-muted-foreground">
                  {group.description || `${count} active ${count === 1 ? 'task' : 'tasks'}`}
                </p>
              </div>
              {!showArchived ? (
                <button
                  onClick={() => setEditing(group)}
                  className="grid size-8 place-items-center rounded-lg text-surface-muted-foreground hover:bg-surface-muted"
                  aria-label={`Edit ${group.name}`}
                >
                  <Pencil size={15} />
                </button>
              ) : null}
              <button
                onClick={() =>
                  void perform(() =>
                    showArchived ? actions.restoreGroup(group.id) : actions.archiveGroup(group.id),
                  )
                }
                className="grid size-8 place-items-center rounded-lg text-surface-muted-foreground hover:bg-surface-muted"
                aria-label={`${showArchived ? 'Restore' : 'Archive'} ${group.name}`}
              >
                {showArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
              </button>
            </div>
          );
        })}
        {!source.length ? (
          <div className="px-6 py-14 text-center">
            <FolderKanban className="mx-auto mb-3 text-surface-muted-foreground" />
            <p className="m-0 text-sm font-medium">
              {showArchived ? 'No archived groups' : 'Create your first group'}
            </p>
            <p className="mt-1 text-xs text-surface-muted-foreground">
              Tasks may also remain ungrouped.
            </p>
          </div>
        ) : null}
      </div>
      {editing !== undefined ? (
        <GroupDialog group={editing} onClose={() => setEditing(undefined)} onSave={save} />
      ) : null}
    </div>
  );
}
