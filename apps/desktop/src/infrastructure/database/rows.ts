import type {
  EntryCategory,
  EntryTag,
  Group,
  RecentEntry,
  RunningTimer,
  Task,
  TimeEntry,
  WorkTag,
} from '@time-tracker/domain';

export type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskRow = {
  id: string;
  external_id: string | null;
  group_id: string | null;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  category_archived_at: string | null;
  category_created_at: string | null;
  category_updated_at: string | null;
  tags_json: string;
  title: string;
  description: string | null;
  color: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EntryRow = {
  id: string;
  task_id: string;
  group_id: string | null;
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  tags_json: string;
  task_external_id_snapshot: string | null;
  task_title_snapshot: string | null;
  task_color_snapshot: string | null;
  group_name_snapshot: string | null;
  group_color_snapshot: string | null;
  started_at: string;
  ended_at: string | null;
  note: string | null;
  confirmed_at: string | null;
  check_due_at: string | null;
  verification_state: 'confirmed' | 'pending';
  created_at: string;
  updated_at: string;
};

export function parseTags<T extends EntryTag | WorkTag>(value: string): T[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is T =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as { id?: unknown }).id === 'string' &&
        typeof (item as { name?: unknown }).name === 'string',
    );
  } catch {
    return [];
  }
}

export function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    externalId: row.external_id,
    groupId: row.group_id,
    category:
      row.category_id && row.category_name && row.category_created_at && row.category_updated_at
        ? {
            id: row.category_id,
            name: row.category_name,
            color: row.category_color,
            archivedAt: row.category_archived_at,
            createdAt: row.category_created_at,
            updatedAt: row.category_updated_at,
          }
        : null,
    tags: parseTags<WorkTag>(row.tags_json),
    title: row.title,
    description: row.description,
    color: row.color,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toEntry(row: EntryRow): TimeEntry {
  return {
    id: row.id,
    taskId: row.task_id,
    groupId: row.group_id,
    category:
      row.category_id && row.category_name
        ? ({
            id: row.category_id,
            name: row.category_name,
            color: row.category_color,
          } satisfies EntryCategory)
        : null,
    tags: parseTags<EntryTag>(row.tags_json),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    note: row.note,
    confirmedAt: row.confirmed_at,
    checkDueAt: row.check_due_at,
    verificationState: row.verification_state,
    notes: [],
  };
}

export function toRunning(row: EntryRow & TaskRow): RunningTimer {
  return { ...toEntry(row), task: toTask(row), group: null };
}

export type RecentEntryRow = Pick<EntryRow, 'id' | 'started_at' | 'ended_at'> & {
  task_id: string;
  task_external_id: string | null;
  task_title: string;
  task_color: string | null;
  group_id: string | null;
  group_name: string | null;
  group_color: string | null;
};

export function toRecentEntry(row: RecentEntryRow): RecentEntry {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    task: {
      id: row.task_id,
      externalId: row.task_external_id,
      title: row.task_title,
      color: row.task_color,
    },
    group: row.group_id
      ? { id: row.group_id, name: row.group_name ?? 'Unknown group', color: row.group_color }
      : null,
  };
}
