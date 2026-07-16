import type { EntryTag, HistoryEntry, WorkTag } from '@time-tracker/domain';
import { openDatabase } from '../../infrastructure/database/client';
import { parseTags, type EntryRow } from '../../infrastructure/database/rows';
import type { ReportRange } from './report';
import { validateReportRange } from './report';
import { WorkNoteRepository } from '../notes/workNoteRepository';

const workNoteRepository = new WorkNoteRepository();

type ReportRow = EntryRow & {
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

export class ReportRepository {
  async listForRange(range: ReportRange, now = new Date()): Promise<HistoryEntry[]> {
    const bounds = validateReportRange(range);
    const database = await openDatabase();
    const rows = await database.select<ReportRow[]>(
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
      [bounds.end.toISOString(), now.toISOString(), bounds.start.toISOString()],
    );
    const entries = rows.map((row) => ({
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
    }));
    const notes = await workNoteRepository.listForEntryIds(entries.map((entry) => entry.id));
    return entries.map((entry) => ({ ...entry, notes: notes.get(entry.id) ?? [] }));
  }
}
