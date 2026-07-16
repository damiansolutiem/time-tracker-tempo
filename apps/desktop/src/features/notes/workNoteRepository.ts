import type { WorkNote, WorkNoteDraft, WorkNoteExtraData } from '@time-tracker/domain';
import { openDatabase } from '../../infrastructure/database/client';

type WorkNoteRow = {
  id: string;
  time_entry_id: string;
  content: string;
  extra_data_json: string;
  created_at: string;
  updated_at: string;
};

function parseExtraData(value: string): WorkNoteExtraData {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as WorkNoteExtraData)
      : {};
  } catch {
    return {};
  }
}

function toWorkNote(row: WorkNoteRow): WorkNote {
  return {
    id: row.id,
    timeEntryId: row.time_entry_id,
    content: row.content,
    extraData: parseExtraData(row.extra_data_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeWorkNoteDraft(draft: WorkNoteDraft) {
  const content = draft.content.trim();
  if (!content) throw new Error('Note text is required.');
  const extraData = { ...draft.extraData };
  if ('timeSpentMs' in extraData) {
    const value = extraData.timeSpentMs;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error('Time spent must be a positive duration.');
    }
    if (value === 0) delete extraData.timeSpentMs;
    else extraData.timeSpentMs = Math.round(value);
  }
  return { content, extraData };
}

export class WorkNoteRepository {
  async listForEntryIds(entryIds: string[]): Promise<Map<string, WorkNote[]>> {
    const result = new Map<string, WorkNote[]>();
    for (const id of entryIds) result.set(id, []);
    if (!entryIds.length) return result;
    const database = await openDatabase();
    for (let offset = 0; offset < entryIds.length; offset += 500) {
      const batch = entryIds.slice(offset, offset + 500);
      const placeholders = batch.map((_, index) => `$${index + 1}`).join(', ');
      const rows = await database.select<WorkNoteRow[]>(
        `SELECT id, time_entry_id, content, extra_data_json, created_at, updated_at
         FROM work_notes WHERE time_entry_id IN (${placeholders})
         ORDER BY created_at ASC, id ASC`,
        batch,
      );
      for (const row of rows) {
        const notes = result.get(row.time_entry_id) ?? [];
        notes.push(toWorkNote(row));
        result.set(row.time_entry_id, notes);
      }
    }
    return result;
  }

  async create(timeEntryId: string, draft: WorkNoteDraft): Promise<WorkNote> {
    const normalized = normalizeWorkNoteDraft(draft);
    const database = await openDatabase();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const result = await database.execute(
      `INSERT INTO work_notes (
        id, time_entry_id, content, extra_data_json, created_at, updated_at
      )
      SELECT $1, id, $2, $3, $4, $4 FROM time_entries WHERE id = $5`,
      [id, normalized.content, JSON.stringify(normalized.extraData), now, timeEntryId],
    );
    if (result.rowsAffected !== 1) throw new Error('The time entry is unavailable.');
    return {
      id,
      timeEntryId,
      content: normalized.content,
      extraData: normalized.extraData,
      createdAt: now,
      updatedAt: now,
    };
  }

  async update(id: string, draft: WorkNoteDraft): Promise<void> {
    const normalized = normalizeWorkNoteDraft(draft);
    const database = await openDatabase();
    const result = await database.execute(
      `UPDATE work_notes SET content = $1, extra_data_json = $2, updated_at = $3
       WHERE id = $4`,
      [normalized.content, JSON.stringify(normalized.extraData), new Date().toISOString(), id],
    );
    if (result.rowsAffected !== 1) throw new Error('The note no longer exists.');
  }

  async delete(id: string): Promise<void> {
    const database = await openDatabase();
    const result = await database.execute('DELETE FROM work_notes WHERE id = $1', [id]);
    if (result.rowsAffected !== 1) throw new Error('The note no longer exists.');
  }
}
