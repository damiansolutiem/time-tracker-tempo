import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDefaultWorkSchedule } from '../settings/workSchedule';
import { buildUnclassifiedScheduledGaps } from './workdayGaps';

const originalTimezone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Europe/Madrid';
});

afterAll(() => {
  process.env.TZ = originalTimezone;
});

function schedule() {
  const value = createDefaultWorkSchedule();
  value.enabled = true;
  return value;
}

function iso(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(2026, 6, 15, hours, minutes).toISOString();
}

describe('unclassified scheduled gaps', () => {
  it('subtracts the union of task time and classifications from elapsed planned blocks', () => {
    const gaps = buildUnclassifiedScheduledGaps(
      schedule(),
      '2026-07-15',
      [{ startedAt: iso('09:00'), endedAt: iso('09:30') }],
      [{ startedAt: iso('09:45'), endedAt: iso('10:00') }],
      new Date(2026, 6, 15, 10).getTime(),
    );
    expect(gaps).toEqual([
      { startedAt: iso('09:30'), endedAt: iso('09:45'), durationMs: 15 * 60_000 },
    ]);
  });

  it('does not create gaps before work, during planned breaks, or on unscheduled days', () => {
    expect(
      buildUnclassifiedScheduledGaps(
        schedule(),
        '2026-07-15',
        [],
        [],
        new Date(2026, 6, 15, 8).getTime(),
      ),
    ).toEqual([]);
    const lunch = buildUnclassifiedScheduledGaps(
      schedule(),
      '2026-07-15',
      [{ startedAt: iso('09:00'), endedAt: iso('13:00') }],
      [],
      new Date(2026, 6, 15, 13, 30).getTime(),
    );
    expect(lunch).toEqual([]);
    expect(
      buildUnclassifiedScheduledGaps(
        schedule(),
        '2026-07-18',
        [],
        [],
        new Date(2026, 6, 18, 12).getTime(),
      ),
    ).toEqual([]);
  });

  it('clips completed-day gaps to planned blocks and excludes the planned break', () => {
    const gaps = buildUnclassifiedScheduledGaps(
      schedule(),
      '2026-07-15',
      [],
      [],
      new Date(2026, 6, 16, 9).getTime(),
    );
    expect(gaps.map((gap) => [gap.startedAt, gap.endedAt])).toEqual([
      [iso('09:00'), iso('13:00')],
      [iso('14:00'), iso('18:00')],
    ]);
  });

  it('reconstructs an unresolved historical gap after an application restart', () => {
    const persistedEntries = [{ startedAt: iso('09:00'), endedAt: iso('10:00') }];
    const persistedClassifications = [{ startedAt: iso('10:30'), endedAt: iso('11:00') }];
    const afterDay = new Date(2026, 6, 16, 9).getTime();

    const beforeRestart = buildUnclassifiedScheduledGaps(
      schedule(),
      '2026-07-15',
      persistedEntries,
      persistedClassifications,
      afterDay,
    );
    const afterRestart = buildUnclassifiedScheduledGaps(
      schedule(),
      '2026-07-15',
      structuredClone(persistedEntries),
      structuredClone(persistedClassifications),
      afterDay,
    );

    expect(afterRestart).toEqual(beforeRestart);
    expect(afterRestart[0]).toMatchObject({
      startedAt: iso('10:00'),
      endedAt: iso('10:30'),
      durationMs: 30 * 60_000,
    });
  });
});
