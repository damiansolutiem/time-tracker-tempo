import type {
  EntryTag,
  HistoryEntry,
  TimeEntryCorrection,
  TimeEntryCorrectionDraft,
  TimeEntryCorrectionSnapshot,
  WorkTag,
} from '@time-tracker/domain';
import { openDatabase } from '../../infrastructure/database/client';
import { parseTags, type EntryRow } from '../../infrastructure/database/rows';
import type { LocalDayBounds } from './day';
import { validateTimeEntryDraft } from './entryValidation';
import { WorkNoteRepository } from '../notes/workNoteRepository';

const workNoteRepository = new WorkNoteRepository();

type HistoryRow = EntryRow & {
  correction_count: number;
  last_corrected_at: string | null;
  task_group_id: string | null;
  task_category_id: string | null;
  task_category_name: string | null;
  task_category_color: string | null;
  task_category_archived_at: string | null;
  task_category_created_at: string | null;
  task_category_updated_at: string | null;
  task_tags_json: string;
  task_external_id: string | null;
  task_title: string;
  task_description: string | null;
  task_color: string | null;
  task_archived_at: string | null;
  task_created_at: string;
  task_updated_at: string;
  group_name: string | null;
  group_description: string | null;
  group_color: string | null;
  group_archived_at: string | null;
  group_created_at: string | null;
  group_updated_at: string | null;
};

function toHistoryEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    taskId: row.task_id,
    groupId: row.group_id,
    category:
      row.category_id && row.category_name
        ? { id: row.category_id, name: row.category_name, color: row.category_color }
        : null,
    tags: parseTags<EntryTag>(row.tags_json),
    startedAt: row.started_at,
    endedAt: row.ended_at,
    note: row.note,
    confirmedAt: row.confirmed_at,
    checkDueAt: row.check_due_at,
    verificationState: row.verification_state,
    notes: [],
    correctionCount: row.correction_count,
    lastCorrectedAt: row.last_corrected_at,
    task: {
      id: row.task_id,
      externalId: row.task_external_id_snapshot ?? row.task_external_id,
      groupId: row.task_group_id,
      category:
        row.task_category_id &&
        row.task_category_name &&
        row.task_category_created_at &&
        row.task_category_updated_at
          ? {
              id: row.task_category_id,
              name: row.task_category_name,
              color: row.task_category_color,
              archivedAt: row.task_category_archived_at,
              createdAt: row.task_category_created_at,
              updatedAt: row.task_category_updated_at,
            }
          : null,
      tags: parseTags<WorkTag>(row.task_tags_json),
      title: row.task_title_snapshot ?? row.task_title,
      description: row.task_description,
      color: row.task_color_snapshot ?? row.task_color,
      archivedAt: row.task_archived_at,
      createdAt: row.task_created_at,
      updatedAt: row.task_updated_at,
    },
    group:
      row.group_id && row.group_name && row.group_created_at && row.group_updated_at
        ? {
            id: row.group_id,
            name: row.group_name_snapshot ?? row.group_name,
            description: row.group_description,
            color: row.group_color_snapshot ?? row.group_color,
            archivedAt: row.group_archived_at,
            createdAt: row.group_created_at,
            updatedAt: row.group_updated_at,
          }
        : null,
  };
}

export class HistoryRepository {
  async listForDay(day: LocalDayBounds, now = new Date()): Promise<HistoryEntry[]> {
    const database = await openDatabase();
    const rows = await database.select<HistoryRow[]>(
      `SELECT e.*,
        (SELECT COUNT(*) FROM time_entry_corrections revision
         WHERE revision.time_entry_id = e.id) AS correction_count,
        (SELECT MAX(created_at) FROM time_entry_corrections revision
         WHERE revision.time_entry_id = e.id) AS last_corrected_at,
        t.group_id AS task_group_id, t.external_id AS task_external_id, t.title AS task_title,
        t.description AS task_description, t.color AS task_color,
        t.archived_at AS task_archived_at, t.created_at AS task_created_at,
        t.updated_at AS task_updated_at,
        c.id AS task_category_id, c.name AS task_category_name,
        c.color AS task_category_color, c.archived_at AS task_category_archived_at,
        c.created_at AS task_category_created_at, c.updated_at AS task_category_updated_at,
        COALESCE((SELECT json_group_array(json_object(
          'id', selected.id, 'name', selected.name, 'color', selected.color,
          'archivedAt', selected.archived_at, 'createdAt', selected.created_at,
          'updatedAt', selected.updated_at
        )) FROM (
          SELECT tag.id, tag.name, tag.color, tag.archived_at, tag.created_at, tag.updated_at
          FROM json_each(t.tag_ids_json) assignment
          JOIN work_tags tag ON tag.id = assignment.value
          ORDER BY tag.name COLLATE NOCASE
        ) selected), '[]') AS task_tags_json,
        g.name AS group_name, g.description AS group_description, g.color AS group_color,
        g.archived_at AS group_archived_at, g.created_at AS group_created_at,
        g.updated_at AS group_updated_at
       FROM time_entries e JOIN tasks t ON t.id = e.task_id
       LEFT JOIN groups g ON g.id = e.group_id
       LEFT JOIN work_categories c ON c.id = t.category_id
       WHERE e.started_at < $1 AND COALESCE(e.ended_at, $2) > $3
       ORDER BY e.started_at ASC`,
      [day.end.toISOString(), now.toISOString(), day.start.toISOString()],
    );
    const entries = rows.map(toHistoryEntry);
    const notes = await workNoteRepository.listForEntryIds(entries.map((entry) => entry.id));
    return entries.map((entry) => ({ ...entry, notes: notes.get(entry.id) ?? [] }));
  }

  async update(id: string, draft: TimeEntryCorrectionDraft): Promise<void> {
    validateTimeEntryDraft(draft);
    const reason = draft.reason.trim();
    if (!reason) throw new Error('Explain why this historical correction is needed.');
    const database = await openDatabase();
    const taskDefaults = await database.select<
      { category_id: string | null; tag_ids_json: string }[]
    >('SELECT category_id, tag_ids_json FROM tasks WHERE id = $1', [draft.taskId]);
    const defaults = taskDefaults[0];
    if (!defaults) throw new Error('The selected task no longer exists.');
    const categoryId = draft.categoryId === undefined ? defaults.category_id : draft.categoryId;
    const tagIds = [...new Set(draft.tagIds ?? (JSON.parse(defaults.tag_ids_json) as string[]))];
    const tagIdsJson = JSON.stringify(tagIds);
    const now = new Date().toISOString();
    const result = await database.execute(
      `UPDATE time_entries
       SET task_id = $1,
           group_id = (SELECT group_id FROM tasks WHERE tasks.id = $1),
           task_external_id_snapshot = (SELECT external_id FROM tasks WHERE tasks.id = $1),
           task_title_snapshot = (SELECT title FROM tasks WHERE tasks.id = $1),
           task_color_snapshot = (SELECT color FROM tasks WHERE tasks.id = $1),
           group_name_snapshot = (SELECT groups.name FROM tasks
             LEFT JOIN groups ON groups.id = tasks.group_id WHERE tasks.id = $1),
           group_color_snapshot = (SELECT groups.color FROM tasks
             LEFT JOIN groups ON groups.id = tasks.group_id WHERE tasks.id = $1),
           category_id = $2,
           category_name = (SELECT name FROM work_categories WHERE id = $2),
           category_color = (SELECT color FROM work_categories WHERE id = $2),
           tags_json = COALESCE((SELECT json_group_array(json_object(
             'id', selected.id, 'name', selected.name, 'color', selected.color
           )) FROM (
             SELECT tag.id, tag.name, tag.color
             FROM json_each($3) assignment
             JOIN work_tags tag ON tag.id = assignment.value
             ORDER BY tag.name COLLATE NOCASE
           ) selected), '[]'),
           started_at = $4, ended_at = $5, note = $6, updated_at = $7,
           correction_revision_token = $8, correction_reason = $9
       WHERE id = $10
         AND EXISTS (SELECT 1 FROM tasks WHERE tasks.id = $1)
         AND ($2 IS NULL OR EXISTS (SELECT 1 FROM work_categories WHERE id = $2))
         AND (SELECT COUNT(*) FROM json_each($3)) = (
           SELECT COUNT(*) FROM work_tags WHERE id IN (SELECT value FROM json_each($3))
         )
         AND NOT EXISTS (
           SELECT 1 FROM time_entries other
           WHERE other.id <> $10
             AND other.started_at < COALESCE($5, '9999-12-31T23:59:59.999Z')
             AND COALESCE(other.ended_at, '9999-12-31T23:59:59.999Z') > $4
         )
         AND NOT EXISTS (
           SELECT 1 FROM workday_classifications classification
           WHERE classification.started_at < COALESCE($5, '9999-12-31T23:59:59.999Z')
             AND COALESCE(classification.ended_at, '9999-12-31T23:59:59.999Z') > $4
         )`,
      [
        draft.taskId,
        categoryId,
        tagIdsJson,
        draft.startedAt,
        draft.endedAt,
        draft.note?.trim() || null,
        now,
        crypto.randomUUID(),
        reason,
        id,
      ],
    );
    if (result.rowsAffected === 1) return;
    const existing = await database.select<{ id: string }[]>(
      'SELECT id FROM time_entries WHERE id = $1',
      [id],
    );
    if (!existing.length) throw new Error('This time entry no longer exists.');
    throw new Error('This correction overlaps another record or uses an unavailable label.');
  }

  async listCorrections(id: string): Promise<TimeEntryCorrection[]> {
    const database = await openDatabase();
    const rows = await database.select<
      {
        id: string;
        time_entry_id: string;
        reason: string;
        before_json: string;
        after_json: string;
        created_at: string;
      }[]
    >(
      `SELECT id, time_entry_id, reason, before_json, after_json, created_at
       FROM time_entry_corrections WHERE time_entry_id = $1
       ORDER BY created_at DESC, id DESC`,
      [id],
    );
    return rows.map((row) => ({
      id: row.id,
      timeEntryId: row.time_entry_id,
      reason: row.reason,
      before: JSON.parse(row.before_json) as TimeEntryCorrectionSnapshot,
      after: JSON.parse(row.after_json) as TimeEntryCorrectionSnapshot,
      createdAt: row.created_at,
    }));
  }
}
