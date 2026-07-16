import type { Group, Task, TaskDraft, WorkCategory, WorkTag } from '@time-tracker/domain';
import {
  Archive,
  ArchiveRestore,
  Download,
  FileSpreadsheet,
  Pencil,
  Play,
  Plus,
  Search,
  Square,
  Upload,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { appStore } from '../../app/store';
import { saveTaskExport, type TaskExportFormat } from '../../infrastructure/dataPortability';
import { localDateKey } from '../history/day';
import { taskColorClass } from './taskColors';
import { TaskDialog } from './TaskDialog';
import { TaskImportDialog } from './TaskImportDialog';
import { serializeTasksCsv, serializeTasksWorkbook } from './taskTransfer';

type Actions = typeof appStore;

export function TasksPage({
  tasks,
  archivedTasks,
  groups,
  categories,
  tags,
  runningTaskId,
  actions,
}: {
  tasks: Task[];
  archivedTasks: Task[];
  groups: Group[];
  categories: WorkCategory[];
  tags: WorkTag[];
  runningTaskId: string | null;
  actions: Actions;
}) {
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [groupFilter, setGroupFilter] = useState('all');
  const [editing, setEditing] = useState<Task | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState<TaskExportFormat | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const source = showArchived ? archivedTasks : tasks;
  const filtered = useMemo(
    () =>
      source.filter((task) => {
        const group = groups.find((item) => item.id === task.groupId);
        const matchesGroup =
          groupFilter === 'all' ||
          (groupFilter === 'ungrouped' ? !task.groupId : task.groupId === groupFilter);
        const matchesQuery =
          `${task.externalId ?? ''} ${task.title} ${task.description ?? ''} ${group?.name ?? ''} ${task.category?.name ?? ''} ${task.tags.map((tag) => tag.name).join(' ')}`
            .toLowerCase()
            .includes(query.toLowerCase());
        return matchesGroup && matchesQuery;
      }),
    [groupFilter, groups, query, source],
  );
  const sections = useMemo(() => {
    const byGroup = new Map<string, Task[]>();
    for (const task of filtered) {
      const key = task.groupId ?? 'ungrouped';
      byGroup.set(key, [...(byGroup.get(key) ?? []), task]);
    }
    return [...byGroup.entries()]
      .map(([key, sectionTasks]) => ({
        key,
        group: groups.find((group) => group.id === key) ?? null,
        tasks: sectionTasks,
      }))
      .sort((first, second) => {
        if (!first.group) return 1;
        if (!second.group) return -1;
        return first.group.name.localeCompare(second.group.name);
      });
  }, [filtered, groups]);

  async function perform(operation: () => Promise<void>) {
    setError(null);
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The task could not be updated.');
    }
  }

  async function save(draft: TaskDraft) {
    if (editing) await actions.updateTask(editing.id, draft);
    else await actions.createTask(draft);
  }

  async function exportTasks(format: TaskExportFormat) {
    setExporting(format);
    setError(null);
    setMessage(null);
    try {
      const allTasks = [...tasks, ...archivedTasks];
      const contents =
        format === 'csv'
          ? serializeTasksCsv(allTasks, groups)
          : await serializeTasksWorkbook(allTasks, groups);
      const path = await saveTaskExport(
        format,
        contents,
        `tempo-tasks-${localDateKey()}.${format}`,
      );
      if (path) setMessage(`${format.toUpperCase()} task export saved.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Tasks could not be exported.');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-10 py-9">
      <header className="mb-7 flex items-start justify-between">
        <div>
          <h1 className="m-0 text-3xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-2 text-sm text-surface-muted-foreground">
            Create, organize, archive, and start tracked work.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm hover:bg-surface-muted"
          >
            <Upload size={15} /> Import
          </button>
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => void exportTasks('csv')}
            className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm hover:bg-surface-muted disabled:opacity-45"
          >
            <Download size={15} /> {exporting === 'csv' ? 'Exporting…' : 'CSV'}
          </button>
          <button
            type="button"
            disabled={exporting !== null}
            onClick={() => void exportTasks('xlsx')}
            className="flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-semibold shadow-sm hover:bg-surface-muted disabled:opacity-45"
          >
            <FileSpreadsheet size={15} /> {exporting === 'xlsx' ? 'Exporting…' : 'Excel'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-sm"
          >
            <Plus size={16} /> New task
          </button>
        </div>
      </header>
      {message ? (
        <p
          role="status"
          className="mb-4 rounded-lg bg-success-container px-3 py-2 text-sm text-success"
        >
          {message}
        </p>
      ) : null}
      <div className="mb-4 flex items-center gap-3">
        <label className="flex flex-1 items-center gap-2 rounded-lg border bg-card px-3 py-2">
          <span className="sr-only">Search tasks</span>
          <Search size={16} className="text-surface-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
          />
        </label>
        <select
          aria-label="Filter tasks by group"
          value={groupFilter}
          onChange={(event) => setGroupFilter(event.target.value)}
          className="rounded-lg border bg-card px-3 py-2 text-sm font-medium"
        >
          <option value="all">All groups</option>
          <option value="ungrouped">Ungrouped</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
              {group.archivedAt ? ' (archived)' : ''}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setShowArchived(!showArchived)}
          className="rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-surface-muted"
        >
          {showArchived ? 'Active tasks' : `Archived (${archivedTasks.length})`}
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-container px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
        {sections.map((section) => (
          <section key={section.key}>
            <div className="flex items-center gap-2 border-b bg-surface-muted/55 px-5 py-2.5">
              <span
                className={`size-2.5 rounded-full ${taskColorClass(section.group?.color ?? null)}`}
              />
              <h2 className="m-0 text-xs font-semibold uppercase tracking-wider text-surface-muted-foreground">
                {section.group?.name ?? 'Ungrouped'}
              </h2>
              <span className="text-xs text-surface-muted-foreground">{section.tasks.length}</span>
            </div>
            <div className="divide-y">
              {section.tasks.map((task) => {
                const running = runningTaskId === task.id;
                return (
                  <div key={task.id} className="flex items-center gap-4 px-5 py-4">
                    <span className={`size-3 rounded-full ${taskColorClass(task.color)}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="m-0 truncate text-sm font-medium">{task.title}</p>
                        {task.externalId ? (
                          <span
                            className="max-w-32 shrink-0 truncate rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-surface-muted-foreground"
                            title={task.externalId}
                          >
                            {task.externalId}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-surface-muted-foreground">
                        {[
                          task.category?.name,
                          ...task.tags.map((tag) => `#${tag.name}`),
                          task.description,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'No description'}
                      </p>
                    </div>
                    {!showArchived && (
                      <button
                        onClick={() =>
                          void perform(() =>
                            running ? actions.stopTimer() : actions.startTask(task.id),
                          )
                        }
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${running ? 'bg-danger-container text-danger' : 'bg-primary-container text-primary-container-foreground'}`}
                      >
                        {running ? (
                          <Square size={13} fill="currentColor" />
                        ) : (
                          <Play size={13} fill="currentColor" />
                        )}
                        {running ? 'Stop' : 'Start'}
                      </button>
                    )}
                    {!showArchived && (
                      <button
                        onClick={() => setEditing(task)}
                        className="grid size-8 place-items-center rounded-lg text-surface-muted-foreground hover:bg-surface-muted"
                        aria-label={`Edit ${task.title}`}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    <button
                      onClick={() =>
                        void perform(() =>
                          showArchived
                            ? actions.restoreTask(task.id)
                            : actions.archiveTask(task.id),
                        )
                      }
                      className="grid size-8 place-items-center rounded-lg text-surface-muted-foreground hover:bg-surface-muted"
                      aria-label={`${showArchived ? 'Restore' : 'Archive'} ${task.title}`}
                    >
                      {showArchived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {filtered.length === 0 && (
          <div className="px-6 py-14 text-center">
            <p className="m-0 text-sm font-medium">
              {query
                ? 'No matching tasks'
                : showArchived
                  ? 'No archived tasks'
                  : 'Create your first task'}
            </p>
            <p className="mt-1 text-xs text-surface-muted-foreground">
              {query ? 'Try a different search.' : 'Tasks you track will appear here.'}
            </p>
          </div>
        )}
      </div>
      {editing !== undefined && (
        <TaskDialog
          task={editing}
          groups={groups.filter((group) => !group.archivedAt || group.id === editing?.groupId)}
          categories={categories.filter(
            (category) => !category.archivedAt || category.id === editing?.category?.id,
          )}
          tags={tags.filter(
            (tag) => !tag.archivedAt || editing?.tags.some((assigned) => assigned.id === tag.id),
          )}
          onClose={() => setEditing(undefined)}
          onSave={save}
        />
      )}
      {importOpen ? (
        <TaskImportDialog actions={actions} onClose={() => setImportOpen(false)} />
      ) : null}
    </div>
  );
}
