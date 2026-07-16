import type { WorkdayClassification, WorkdayClassificationDraft } from '@time-tracker/domain';
import { describe, expect, it } from 'vitest';
import { WorkdayClassificationCoordinator } from './WorkdayClassificationCoordinator';
import type { WorkdayClassificationRepository } from './workdayClassificationRepository';

class FakeRepository implements WorkdayClassificationRepository {
  running: WorkdayClassification | null = null;
  entries: WorkdayClassification[] = [];

  getRunning() {
    return Promise.resolve(this.running);
  }
  listForDay() {
    return Promise.resolve(this.entries);
  }

  listForRange() {
    return Promise.resolve(this.entries);
  }
  create(draft: WorkdayClassificationDraft) {
    const entry: WorkdayClassification = {
      id: `classification-${this.entries.length + 1}`,
      ...draft,
      createdAt: draft.startedAt,
      updatedAt: draft.startedAt,
    };
    this.entries.push(entry);
    this.running = entry.endedAt ? null : entry;
    return Promise.resolve(entry);
  }
  stop(endedAt: string) {
    if (this.running) this.running.endedAt = endedAt;
    this.running = null;
    return Promise.resolve();
  }
  update() {
    return Promise.resolve();
  }
  delete() {
    return Promise.resolve();
  }
}

describe('WorkdayClassificationCoordinator', () => {
  it('recovers a persisted break', async () => {
    const repository = new FakeRepository();
    await repository.create({
      category: 'break',
      startedAt: '2026-07-15T08:00:00.000Z',
      endedAt: null,
      note: null,
    });
    const coordinator = new WorkdayClassificationCoordinator(repository);
    await coordinator.initialize();
    expect(coordinator.getSnapshot().running?.category).toBe('break');
  });

  it('recovers the same persisted break after coordinator reconstruction', async () => {
    const repository = new FakeRepository();
    await repository.create({
      category: 'break',
      startedAt: '2026-07-15T08:00:00.000Z',
      endedAt: null,
      note: null,
    });
    const firstRuntime = new WorkdayClassificationCoordinator(repository);
    await firstRuntime.initialize();
    const secondRuntime = new WorkdayClassificationCoordinator(repository);
    await secondRuntime.initialize();

    expect(secondRuntime.getSnapshot().running).toEqual(firstRuntime.getSnapshot().running);
    expect(repository.entries).toHaveLength(1);
  });

  it('stops a break at the coordinator timestamp', async () => {
    const repository = new FakeRepository();
    const times = [new Date('2026-07-15T08:00:00.000Z'), new Date('2026-07-15T08:30:00.000Z')];
    const coordinator = new WorkdayClassificationCoordinator(repository, {
      now: () => times.shift()!,
    });
    await coordinator.startBreak();
    await coordinator.stop();
    expect(repository.entries[0]?.endedAt).toBe('2026-07-15T08:30:00.000Z');
    expect(coordinator.getSnapshot().running).toBeNull();
  });
});
