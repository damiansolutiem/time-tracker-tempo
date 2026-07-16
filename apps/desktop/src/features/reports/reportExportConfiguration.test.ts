import { describe, expect, it } from 'vitest';
import {
  defaultReportExportColumns,
  normalizeReportExportColumns,
} from './reportExportConfiguration';

describe('report export configuration', () => {
  it('keeps valid custom columns and discards invalid formats', () => {
    expect(
      normalizeReportExportColumns([
        { id: 'one', field: 'task_id', header: 'Ticket', format: 'text' },
        { id: 'two', field: 'duration', header: 'Wrong', format: 'iso-date' },
      ]),
    ).toEqual([{ id: 'one', field: 'task_id', header: 'Ticket', format: 'text', visible: true }]);
  });

  it('restores defaults when no usable columns remain', () => {
    expect(normalizeReportExportColumns([])).toEqual(defaultReportExportColumns);
  });
});
