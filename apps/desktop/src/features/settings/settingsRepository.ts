import type {
  TrayTimeMode,
  WeeklyWorkSchedule,
  WorkCheckSettings,
  WorkdayReminderSettings,
} from '@time-tracker/domain';
import type { PersistedReminderState } from '../workday/workdayReminder';
import { openDatabase } from '../../infrastructure/database/client';
import { createDefaultWorkSchedule, normalizeWorkSchedule } from './workSchedule';

const defaults: WorkCheckSettings = {
  enabled: true,
  intervalMinutes: 60,
  graceMinutes: 5,
  notificationsEnabled: true,
};

const keys = {
  enabled: 'work_checks_enabled',
  intervalMinutes: 'work_check_interval_minutes',
  graceMinutes: 'work_check_grace_minutes',
  notificationsEnabled: 'notifications_enabled',
} as const;

function parseInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export class SettingsRepository {
  async getWorkdayReminders(): Promise<WorkdayReminderSettings> {
    const database = await openDatabase();
    const rows = await database.select<{ key: string; value: string }[]>(
      `SELECT key, value FROM settings WHERE key IN (
        'workday_reminders_enabled', 'workday_reminder_gap_minutes',
        'workday_reminder_snooze_minutes'
      )`,
    );
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      enabled: values.workday_reminders_enabled === 'true',
      gapMinutes: parseInteger(values.workday_reminder_gap_minutes, 15),
      snoozeMinutes: parseInteger(values.workday_reminder_snooze_minutes, 15),
    };
  }

  async updateWorkdayReminders(settings: WorkdayReminderSettings) {
    const database = await openDatabase();
    const now = new Date().toISOString();
    const values: [string, string][] = [
      ['workday_reminders_enabled', String(settings.enabled)],
      ['workday_reminder_gap_minutes', String(settings.gapMinutes)],
      ['workday_reminder_snooze_minutes', String(settings.snoozeMinutes)],
    ];
    for (const [key, value] of values) {
      await database.execute(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, now],
      );
    }
  }

  async getWorkdayReminderState(): Promise<PersistedReminderState> {
    const database = await openDatabase();
    const rows = await database.select<{ key: string; value: string }[]>(
      `SELECT key, value FROM settings WHERE key IN (
        'workday_reminder_gap_started_at', 'workday_reminder_next_at'
      )`,
    );
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      gapStartedAt: values.workday_reminder_gap_started_at || null,
      nextReminderAt: values.workday_reminder_next_at || null,
    };
  }

  async updateWorkdayReminderState(state: PersistedReminderState) {
    const database = await openDatabase();
    const now = new Date().toISOString();
    for (const [key, value] of [
      ['workday_reminder_gap_started_at', state.gapStartedAt ?? ''],
      ['workday_reminder_next_at', state.nextReminderAt ?? ''],
    ] as const) {
      await database.execute(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, now],
      );
    }
  }

  async getWorkSchedule(): Promise<WeeklyWorkSchedule> {
    const database = await openDatabase();
    const rows = await database.select<{ value: string }[]>(
      `SELECT value FROM settings WHERE key = 'weekly_work_schedule_v1'`,
    );
    if (!rows[0]) return createDefaultWorkSchedule();
    try {
      return normalizeWorkSchedule(JSON.parse(rows[0].value));
    } catch {
      return createDefaultWorkSchedule();
    }
  }

  async getTrayTimeMode(): Promise<TrayTimeMode> {
    const database = await openDatabase();
    const rows = await database.select<{ value: string }[]>(
      `SELECT value FROM settings WHERE key = 'tray_time_mode'`,
    );
    return rows[0]?.value === 'task-total' ? 'task-total' : 'session';
  }

  async updateTrayTimeMode(mode: TrayTimeMode): Promise<void> {
    const database = await openDatabase();
    await database.execute(
      `INSERT INTO settings (key, value, updated_at) VALUES ('tray_time_mode', $1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [mode, new Date().toISOString()],
    );
  }

  async claimRuntimeSession(sessionId: string): Promise<boolean> {
    const database = await openDatabase();
    const rows = await database.select<{ value: string }[]>(
      `SELECT value FROM settings WHERE key = 'runtime_session_id'`,
    );
    const changed = rows[0]?.value !== sessionId;
    if (changed) {
      const now = new Date().toISOString();
      await database.execute(
        `INSERT INTO settings (key, value, updated_at) VALUES ('runtime_session_id', $1, $2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [sessionId, now],
      );
    }
    return changed;
  }

  async getWorkChecks(): Promise<WorkCheckSettings> {
    const database = await openDatabase();
    const rows = await database.select<{ key: string; value: string }[]>(
      `SELECT key, value FROM settings WHERE key IN ($1, $2, $3, $4)`,
      Object.values(keys),
    );
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      enabled: values[keys.enabled] !== 'false',
      intervalMinutes: parseInteger(values[keys.intervalMinutes], defaults.intervalMinutes),
      graceMinutes: parseInteger(values[keys.graceMinutes], defaults.graceMinutes),
      notificationsEnabled: values[keys.notificationsEnabled] !== 'false',
    };
  }

  async updateWorkChecks(settings: WorkCheckSettings): Promise<void> {
    const database = await openDatabase();
    const now = new Date().toISOString();
    const values: [string, string][] = [
      [keys.enabled, String(settings.enabled)],
      [keys.intervalMinutes, String(settings.intervalMinutes)],
      [keys.graceMinutes, String(settings.graceMinutes)],
      [keys.notificationsEnabled, String(settings.notificationsEnabled)],
    ];
    for (const [key, value] of values) {
      await database.execute(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [key, value, now],
      );
    }
  }
}
