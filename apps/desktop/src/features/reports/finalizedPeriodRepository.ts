import type { FinalizedReportPeriod, WeeklyWorkSchedule } from '@time-tracker/domain';
import { openDatabase } from '../../infrastructure/database/client';
import { localDayBounds } from '../history/day';
import { validateReportRange, type ReportRange } from './report';

type Row = {
  id: string;
  start_date: string;
  end_date: string;
  starts_at: string;
  ends_at: string;
  note: string | null;
  schedule_json: string;
  schedules_by_date_json: string | null;
  finalized_at: string;
  unlocked_at: string | null;
  unlock_reason: string | null;
};

function toPeriod(row: Row): FinalizedReportPeriod {
  return {
    id: row.id,
    startDate: row.start_date,
    endDate: row.end_date,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    note: row.note,
    schedule: JSON.parse(row.schedule_json) as WeeklyWorkSchedule,
    schedulesByDate: row.schedules_by_date_json
      ? (JSON.parse(row.schedules_by_date_json) as Record<string, WeeklyWorkSchedule>)
      : {},
    finalizedAt: row.finalized_at,
    unlockedAt: row.unlocked_at,
    unlockReason: row.unlock_reason,
  };
}

export class FinalizedPeriodRepository {
  async list(): Promise<FinalizedReportPeriod[]> {
    const database = await openDatabase();
    const rows = await database.select<Row[]>(
      `SELECT * FROM finalized_report_periods
       ORDER BY finalized_at DESC, start_date DESC`,
    );
    return rows.map(toPeriod);
  }

  async finalize(
    range: ReportRange,
    note: string | null,
    schedule: WeeklyWorkSchedule,
    schedulesByDate: Record<string, WeeklyWorkSchedule>,
  ): Promise<FinalizedReportPeriod> {
    const { start, end } = validateReportRange(range);
    const database = await openDatabase();
    const running = await database.select<{ count: number }[]>(
      `SELECT COUNT(*) AS count FROM (
        SELECT id FROM time_entries WHERE ended_at IS NULL AND started_at < $1
        UNION ALL
        SELECT id FROM workday_classifications WHERE ended_at IS NULL AND started_at < $1
      )`,
      [end.toISOString()],
    );
    if ((running[0]?.count ?? 0) > 0)
      throw new Error('Stop the running timer or classification before finalizing this period.');
    const overlaps = await database.select<{ id: string }[]>(
      `SELECT id FROM finalized_report_periods
       WHERE unlocked_at IS NULL AND starts_at < $2 AND ends_at > $1 LIMIT 1`,
      [start.toISOString(), end.toISOString()],
    );
    if (overlaps.length) throw new Error('This range overlaps an already finalized period.');
    const id = crypto.randomUUID();
    const finalizedAt = new Date().toISOString();
    await database.execute(
      `INSERT INTO finalized_report_periods (
        id, start_date, end_date, starts_at, ends_at, note, schedule_json,
        schedules_by_date_json, finalized_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        range.startDate,
        range.endDate,
        start.toISOString(),
        end.toISOString(),
        note?.trim() || null,
        JSON.stringify(schedule),
        JSON.stringify(schedulesByDate),
        finalizedAt,
      ],
    );
    return {
      id,
      startDate: range.startDate,
      endDate: range.endDate,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      note: note?.trim() || null,
      schedule,
      schedulesByDate,
      finalizedAt,
      unlockedAt: null,
      unlockReason: null,
    };
  }

  async unlock(id: string, reason: string): Promise<void> {
    const normalized = reason.trim();
    if (!normalized) throw new Error('An unlock reason is required.');
    const database = await openDatabase();
    const result = await database.execute(
      `UPDATE finalized_report_periods
       SET unlocked_at = $1, unlock_reason = $2
       WHERE id = $3 AND unlocked_at IS NULL`,
      [new Date().toISOString(), normalized, id],
    );
    if (result.rowsAffected !== 1) throw new Error('This period is no longer finalized.');
  }
}

export function periodContainsDate(period: FinalizedReportPeriod, date: string) {
  const day = localDayBounds(date);
  return day.start.toISOString() < period.endsAt && day.end.toISOString() > period.startsAt;
}
