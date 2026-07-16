import type {
  WeeklyWorkSchedule,
  WorkBlock,
  WorkScheduleOverride,
  WorkScheduleOverrideEvent,
  WorkScheduleRevision,
} from '@time-tracker/domain';
import { openDatabase } from '../../infrastructure/database/client';
import { localDateKey } from '../history/day';
import { getWorkScheduleValidationErrors, normalizeWorkSchedule } from './workSchedule';

type RevisionRow = {
  sequence: number;
  id: string;
  effective_from: string;
  schedule_json: string;
  created_at: string;
  reason: string | null;
};

type OverrideRow = {
  sequence: number;
  id: string;
  date: string;
  action: 'set' | 'remove';
  name: string | null;
  blocks_json: string | null;
  created_at: string;
};

function validateDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must be a local date.`);
}

function validateBlocks(blocks: WorkBlock[]) {
  const schedule = normalizeWorkSchedule({
    enabled: false,
    days: {
      monday: blocks,
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    },
  });
  const errors = getWorkScheduleValidationErrors(schedule);
  if (errors.length) throw new Error(errors[0]);
  return schedule.days.monday;
}

export class WorkSchedulePolicyRepository {
  async listRevisions(): Promise<WorkScheduleRevision[]> {
    const database = await openDatabase();
    const rows = await database.select<RevisionRow[]>(
      `SELECT rowid AS sequence, id, effective_from, schedule_json, created_at, reason
       FROM work_schedule_revisions
       ORDER BY effective_from DESC, created_at DESC, id DESC`,
    );
    return rows.map((row) => ({
      id: row.id,
      effectiveFrom: row.effective_from,
      schedule: normalizeWorkSchedule(JSON.parse(row.schedule_json)),
      createdAt: row.created_at,
      sequence: row.sequence,
      reason: row.reason,
    }));
  }

  async createRevision(
    schedule: WeeklyWorkSchedule,
    effectiveFrom: string,
    reason: string | null,
  ): Promise<WorkScheduleRevision> {
    validateDate(effectiveFrom, 'Effective date');
    if (effectiveFrom < localDateKey() && !reason?.trim())
      throw new Error('A reason is required for a backdated schedule revision.');
    const errors = getWorkScheduleValidationErrors(schedule);
    if (errors.length) throw new Error(errors[0]);
    const normalized = normalizeWorkSchedule(schedule);
    const database = await openDatabase();
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await database.execute(
      `INSERT INTO work_schedule_revisions (
        id, effective_from, schedule_json, created_at, reason
       ) VALUES ($1, $2, $3, $4, $5)`,
      [id, effectiveFrom, JSON.stringify(normalized), createdAt, reason?.trim() || null],
    );
    await database.execute(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('weekly_work_schedule_v1', $1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [JSON.stringify(normalized), createdAt],
    );
    const sequenceRows = await database.select<{ sequence: number }[]>(
      'SELECT rowid AS sequence FROM work_schedule_revisions WHERE id = $1',
      [id],
    );
    return {
      id,
      effectiveFrom,
      schedule: normalized,
      createdAt,
      sequence: sequenceRows[0]?.sequence ?? 0,
      reason: reason?.trim() || null,
    };
  }

  async listOverrides(): Promise<WorkScheduleOverride[]> {
    const events = await this.listOverrideEvents();
    const latest = new Map<string, WorkScheduleOverrideEvent>();
    for (const event of events) if (!latest.has(event.date)) latest.set(event.date, event);
    return [...latest.values()]
      .flatMap((event) =>
        event.action === 'set' && event.name && event.blocks
          ? [
              {
                id: event.id,
                date: event.date,
                name: event.name,
                blocks: event.blocks,
                createdAt: event.createdAt,
                sequence: event.sequence,
              } satisfies WorkScheduleOverride,
            ]
          : [],
      )
      .sort((first, second) => first.date.localeCompare(second.date));
  }

  async listOverrideEvents(): Promise<WorkScheduleOverrideEvent[]> {
    const database = await openDatabase();
    const rows = await database.select<OverrideRow[]>(
      `SELECT rowid AS sequence, id, date, action, name, blocks_json, created_at
       FROM work_schedule_override_events
       ORDER BY created_at DESC, rowid DESC`,
    );
    return rows.map((row) => ({
      id: row.id,
      date: row.date,
      action: row.action,
      name: row.name,
      blocks: row.blocks_json ? (JSON.parse(row.blocks_json) as WorkBlock[]) : null,
      createdAt: row.created_at,
      sequence: row.sequence,
    }));
  }

  async setOverride(date: string, name: string, blocks: WorkBlock[]) {
    validateDate(date, 'Override date');
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('Override name is required.');
    const normalizedBlocks = validateBlocks(blocks);
    const database = await openDatabase();
    await database.execute(
      `INSERT INTO work_schedule_override_events (
        id, date, action, name, blocks_json, created_at
       ) VALUES ($1, $2, 'set', $3, $4, $5)`,
      [
        crypto.randomUUID(),
        date,
        normalizedName,
        JSON.stringify(normalizedBlocks),
        new Date().toISOString(),
      ],
    );
  }

  async removeOverride(date: string) {
    validateDate(date, 'Override date');
    const database = await openDatabase();
    await database.execute(
      `INSERT INTO work_schedule_override_events (id, date, action, created_at)
       VALUES ($1, $2, 'remove', $3)`,
      [crypto.randomUUID(), date, new Date().toISOString()],
    );
  }
}
