import type { ReportExportColumn } from '@time-tracker/domain';
import { openDatabase } from '../../infrastructure/database/client';
import {
  defaultReportExportColumns,
  normalizeReportExportColumns,
} from './reportExportConfiguration';

export class ReportExportSettingsRepository {
  async get(): Promise<ReportExportColumn[]> {
    const database = await openDatabase();
    const rows = await database.select<{ value: string }[]>(
      `SELECT value FROM settings WHERE key = 'report_export_columns'`,
    );
    if (!rows[0]) return defaultReportExportColumns;
    try {
      return normalizeReportExportColumns(JSON.parse(rows[0].value));
    } catch {
      return defaultReportExportColumns;
    }
  }

  async update(columns: ReportExportColumn[]) {
    const normalized = normalizeReportExportColumns(columns);
    const database = await openDatabase();
    await database.execute(
      `INSERT INTO settings (key, value, updated_at) VALUES ('report_export_columns', $1, $2)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [JSON.stringify(normalized), new Date().toISOString()],
    );
    return normalized;
  }
}
