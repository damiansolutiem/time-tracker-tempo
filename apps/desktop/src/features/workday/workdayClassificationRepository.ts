import type { WorkdayClassification, WorkdayClassificationDraft } from '@time-tracker/domain';
import { openDatabase } from '../../infrastructure/database/client';
import type { LocalDayBounds } from '../history/day';

type Row = {
  id: string;
  category: WorkdayClassification['category'];
  started_at: string;
  ended_at: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function toClassification(row: Row): WorkdayClassification {
  return {
    id: row.id,
    category: row.category,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateWorkdayClassificationDraft(
  draft: WorkdayClassificationDraft,
  now = new Date(),
) {
  const start = new Date(draft.startedAt).getTime();
  const end = draft.endedAt ? new Date(draft.endedAt).getTime() : null;
  if (!Number.isFinite(start)) throw new Error('Choose a valid start time.');
  if (start > now.getTime()) throw new Error('A classification cannot start in the future.');
  if (end !== null && !Number.isFinite(end)) throw new Error('Choose a valid end time.');
  if (end !== null && end > now.getTime())
    throw new Error('A classification cannot end in the future.');
  if (end !== null && end <= start) throw new Error('The end time must be after the start time.');
  if (draft.category === 'ignored' && end === null) {
    throw new Error('Ignored time must have an end time.');
  }
}

export interface WorkdayClassificationRepository {
  getRunning(): Promise<WorkdayClassification | null>;
  listForDay(day: LocalDayBounds, now?: Date): Promise<WorkdayClassification[]>;
  listForRange(range: LocalDayBounds, now?: Date): Promise<WorkdayClassification[]>;
  create(draft: WorkdayClassificationDraft): Promise<WorkdayClassification>;
  stop(endedAt: string): Promise<void>;
  update(id: string, draft: WorkdayClassificationDraft): Promise<void>;
  delete(id: string): Promise<void>;
}

export class SqliteWorkdayClassificationRepository implements WorkdayClassificationRepository {
  async getRunning() {
    const database = await openDatabase();
    const rows = await database.select<Row[]>(
      'SELECT * FROM workday_classifications WHERE ended_at IS NULL LIMIT 1',
    );
    return rows[0] ? toClassification(rows[0]) : null;
  }

  async listForDay(day: LocalDayBounds, now = new Date()) {
    return this.listForRange(day, now);
  }

  async listForRange(range: LocalDayBounds, now = new Date()) {
    const database = await openDatabase();
    const rows = await database.select<Row[]>(
      `SELECT * FROM workday_classifications
       WHERE started_at < $1 AND COALESCE(ended_at, $2) > $3
       ORDER BY started_at ASC`,
      [range.end.toISOString(), now.toISOString(), range.start.toISOString()],
    );
    return rows.map(toClassification);
  }

  async create(draft: WorkdayClassificationDraft) {
    validateWorkdayClassificationDraft(draft);
    const database = await openDatabase();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const result = await database.execute(
      `INSERT INTO workday_classifications
       (id, category, started_at, ended_at, note, created_at, updated_at)
       SELECT $1, $2, $3, $4, $5, $6, $6
       WHERE NOT EXISTS (
         SELECT 1 FROM workday_classifications other
         WHERE other.started_at < COALESCE($4, '9999-12-31T23:59:59.999Z')
           AND COALESCE(other.ended_at, '9999-12-31T23:59:59.999Z') > $3
       ) AND NOT EXISTS (
         SELECT 1 FROM time_entries entry
         WHERE entry.started_at < COALESCE($4, '9999-12-31T23:59:59.999Z')
           AND COALESCE(entry.ended_at, $3) > $3
       )`,
      [id, draft.category, draft.startedAt, draft.endedAt, draft.note?.trim() || null, now],
    );
    if (result.rowsAffected !== 1)
      throw new Error('This classification overlaps recorded activity.');
    return (await this.getById(id))!;
  }

  async stop(endedAt: string) {
    const database = await openDatabase();
    await database.execute(
      `UPDATE workday_classifications SET ended_at = $1, updated_at = $1
       WHERE ended_at IS NULL AND started_at < $1`,
      [endedAt],
    );
  }

  async update(id: string, draft: WorkdayClassificationDraft) {
    validateWorkdayClassificationDraft(draft);
    const database = await openDatabase();
    const now = new Date().toISOString();
    const result = await database.execute(
      `UPDATE workday_classifications
       SET category = $1, started_at = $2, ended_at = $3, note = $4, updated_at = $5
       WHERE id = $6
         AND NOT EXISTS (
           SELECT 1 FROM workday_classifications other
           WHERE other.id <> $6
             AND other.started_at < COALESCE($3, '9999-12-31T23:59:59.999Z')
             AND COALESCE(other.ended_at, '9999-12-31T23:59:59.999Z') > $2
         ) AND NOT EXISTS (
           SELECT 1 FROM time_entries entry
           WHERE entry.started_at < COALESCE($3, '9999-12-31T23:59:59.999Z')
             AND COALESCE(entry.ended_at, '9999-12-31T23:59:59.999Z') > $2
         )`,
      [draft.category, draft.startedAt, draft.endedAt, draft.note?.trim() || null, now, id],
    );
    if (result.rowsAffected === 1) return;
    if (!(await this.getById(id))) throw new Error('This classification no longer exists.');
    throw new Error('This classification overlaps recorded activity.');
  }

  async delete(id: string) {
    const database = await openDatabase();
    await database.execute('DELETE FROM workday_classifications WHERE id = $1', [id]);
  }

  private async getById(id: string) {
    const database = await openDatabase();
    const rows = await database.select<Row[]>(
      'SELECT * FROM workday_classifications WHERE id = $1',
      [id],
    );
    return rows[0] ? toClassification(rows[0]) : null;
  }
}
