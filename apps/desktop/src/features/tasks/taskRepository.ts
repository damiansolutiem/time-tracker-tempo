import type { Task, TaskDraft } from '@time-tracker/domain';
import { openDatabase } from '../../infrastructure/database/client';
import { toTask, type TaskRow } from '../../infrastructure/database/rows';

const TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const taskColumns = `t.id, t.external_id, t.group_id, t.title, t.description, t.color,
  t.archived_at, t.created_at, t.updated_at,
  c.id AS category_id, c.name AS category_name, c.color AS category_color,
  c.archived_at AS category_archived_at, c.created_at AS category_created_at,
  c.updated_at AS category_updated_at,
  COALESCE((
    SELECT json_group_array(json_object(
      'id', selected.id, 'name', selected.name, 'color', selected.color,
      'archivedAt', selected.archived_at, 'createdAt', selected.created_at,
      'updatedAt', selected.updated_at
    ))
    FROM (
      SELECT tag.id, tag.name, tag.color, tag.archived_at, tag.created_at, tag.updated_at
      FROM json_each(t.tag_ids_json) assignment
      JOIN work_tags tag ON tag.id = assignment.value
      ORDER BY tag.name COLLATE NOCASE
    ) selected
  ), '[]') AS tags_json`;

function normalizedTagIds(ids: string[] | undefined) {
  return [...new Set(ids ?? [])];
}

export function normalizeExternalTaskId(value: string | null | undefined) {
  const id = value?.trim();
  if (!id) return null;
  if (!TASK_ID_PATTERN.test(id)) {
    throw new Error(
      'Task ID must be 1–64 characters using letters, numbers, dots, dashes, or underscores.',
    );
  }
  return id;
}

export class TaskRepository {
  async list(options: { archived?: boolean } = {}): Promise<Task[]> {
    const database = await openDatabase();
    const where = options.archived ? 't.archived_at IS NOT NULL' : 't.archived_at IS NULL';
    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskColumns}
       FROM tasks t LEFT JOIN work_categories c ON c.id = t.category_id
       WHERE ${where} ORDER BY t.title COLLATE NOCASE`,
    );
    return rows.map(toTask);
  }

  async listRecent(limit = 5): Promise<Task[]> {
    const database = await openDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskColumns}
       FROM tasks t
       LEFT JOIN work_categories c ON c.id = t.category_id
       LEFT JOIN time_entries e ON e.task_id = t.id
       WHERE t.archived_at IS NULL
       GROUP BY t.id
       ORDER BY MAX(e.started_at) DESC NULLS LAST, t.updated_at DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map(toTask);
  }

  async create(draft: TaskDraft): Promise<Task> {
    const title = draft.title.trim();
    if (!title) throw new Error('Task title is required.');
    const database = await openDatabase();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const externalId = normalizeExternalTaskId(draft.externalId);
    const tagIds = normalizedTagIds(draft.tagIds);
    const existing = externalId
      ? await database.select<{ id: string }[]>(
          'SELECT id FROM tasks WHERE external_id = $1 COLLATE NOCASE',
          [externalId],
        )
      : [];
    if (existing.length) throw new Error(`A task with ID "${externalId}" already exists.`);
    const result = await database.execute(
      `INSERT INTO tasks (
         id, external_id, group_id, category_id, tag_ids_json,
         title, description, color, created_at, updated_at
       )
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $9
       WHERE ($3 IS NULL OR EXISTS (
         SELECT 1 FROM groups WHERE id = $3 AND archived_at IS NULL
       ))
       AND ($4 IS NULL OR EXISTS (SELECT 1 FROM work_categories WHERE id = $4))
       AND (SELECT COUNT(*) FROM json_each($5)) = (
         SELECT COUNT(*) FROM work_tags WHERE id IN (SELECT value FROM json_each($5))
       )`,
      [
        id,
        externalId,
        draft.groupId,
        draft.categoryId ?? null,
        JSON.stringify(tagIds),
        title,
        draft.description?.trim() || null,
        draft.color,
        now,
      ],
    );
    if (result.rowsAffected !== 1)
      throw new Error('A selected group, category, or tag is unavailable.');
    return (await this.get(id))!;
  }

  async update(id: string, draft: TaskDraft): Promise<void> {
    const title = draft.title.trim();
    if (!title) throw new Error('Task title is required.');
    const database = await openDatabase();
    const externalId = normalizeExternalTaskId(draft.externalId);
    const tagIds = normalizedTagIds(draft.tagIds);
    const existing = externalId
      ? await database.select<{ id: string }[]>(
          'SELECT id FROM tasks WHERE external_id = $1 COLLATE NOCASE AND id <> $2',
          [externalId, id],
        )
      : [];
    if (existing.length) throw new Error(`A task with ID "${externalId}" already exists.`);
    const result = await database.execute(
      `UPDATE tasks SET external_id = $1, group_id = $2, category_id = $3,
         tag_ids_json = $4, title = $5, description = $6, color = $7, updated_at = $8
       WHERE id = $9 AND ($2 IS NULL OR EXISTS (
         SELECT 1 FROM groups WHERE groups.id = $2 AND archived_at IS NULL
       ) OR group_id = $2)
       AND ($3 IS NULL OR EXISTS (SELECT 1 FROM work_categories WHERE id = $3))
       AND (SELECT COUNT(*) FROM json_each($4)) = (
         SELECT COUNT(*) FROM work_tags WHERE id IN (SELECT value FROM json_each($4))
       )`,
      [
        externalId,
        draft.groupId,
        draft.categoryId ?? null,
        JSON.stringify(tagIds),
        title,
        draft.description?.trim() || null,
        draft.color,
        new Date().toISOString(),
        id,
      ],
    );
    if (result.rowsAffected !== 1)
      throw new Error('A selected group, category, or tag is unavailable.');
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    const database = await openDatabase();
    const now = new Date().toISOString();
    await database.execute('UPDATE tasks SET archived_at = $1, updated_at = $2 WHERE id = $3', [
      archived ? now : null,
      now,
      id,
    ]);
  }

  private async get(id: string): Promise<Task | null> {
    const database = await openDatabase();
    const rows = await database.select<TaskRow[]>(
      `SELECT ${taskColumns}
       FROM tasks t LEFT JOIN work_categories c ON c.id = t.category_id
       WHERE t.id = $1`,
      [id],
    );
    return rows[0] ? toTask(rows[0]) : null;
  }
}
