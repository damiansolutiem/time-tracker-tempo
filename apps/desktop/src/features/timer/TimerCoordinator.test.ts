import type { RunningTimer, Task } from '@time-tracker/domain';
import { describe, expect, it } from 'vitest';
import { TimerCoordinator } from './TimerCoordinator';
import type { StartResult, TimerRepository } from './timeEntryRepository';

const tasks: Record<string, Task> = {
  first: {
    id: 'first',
    externalId: null,
    groupId: null,
    category: null,
    tags: [],
    title: 'First task',
    description: null,
    color: 'green',
    archivedAt: null,
    createdAt: '2026-07-15T08:00:00.000Z',
    updatedAt: '2026-07-15T08:00:00.000Z',
  },
  second: {
    id: 'second',
    externalId: null,
    groupId: null,
    category: null,
    tags: [],
    title: 'Second task',
    description: null,
    color: 'blue',
    archivedAt: null,
    createdAt: '2026-07-15T08:00:00.000Z',
    updatedAt: '2026-07-15T08:00:00.000Z',
  },
};

class FakeTimerRepository implements TimerRepository {
  running: RunningTimer | null = null;
  entries: RunningTimer[] = [];

  getRunning() {
    return Promise.resolve(this.running);
  }

  start(taskId: string, startedAt: string): Promise<StartResult> {
    if (this.running) this.running.endedAt = startedAt;
    const task = tasks[taskId];
    if (!task) throw new Error('Task not found');
    this.running = {
      id: `entry-${this.entries.length + 1}`,
      taskId,
      groupId: null,
      category: null,
      tags: [],
      startedAt,
      endedAt: null,
      note: null,
      confirmedAt: startedAt,
      checkDueAt: null,
      verificationState: 'confirmed',
      notes: [],
      task,
      group: null,
    };
    this.entries.push(this.running);
    return Promise.resolve({ id: this.running.id, startedAt });
  }

  stop(endedAt: string) {
    if (this.running) this.running.endedAt = endedAt;
    this.running = null;
    return Promise.resolve();
  }
}

describe('TimerCoordinator', () => {
  it('restores a persisted running timer during initialization', async () => {
    const repository = new FakeTimerRepository();
    await repository.start('first', '2026-07-15T08:00:00.000Z');
    const coordinator = new TimerCoordinator(repository);

    await coordinator.initialize();

    expect(coordinator.getSnapshot().running?.task.title).toBe('First task');
    expect(coordinator.getSnapshot().status).toBe('ready');
  });

  it('does not create another entry when a new runtime restores a running timer', async () => {
    const repository = new FakeTimerRepository();
    await repository.start('first', '2026-07-15T08:00:00.000Z');
    const firstRuntime = new TimerCoordinator(repository);
    await firstRuntime.initialize();
    const secondRuntime = new TimerCoordinator(repository);
    await secondRuntime.initialize();

    expect(secondRuntime.getSnapshot().running).toEqual(firstRuntime.getSnapshot().running);
    expect(repository.entries).toHaveLength(1);
  });

  it('switches by ending the previous entry at the new start timestamp', async () => {
    const repository = new FakeTimerRepository();
    const times = [new Date('2026-07-15T08:00:00.000Z'), new Date('2026-07-15T09:00:00.000Z')];
    const coordinator = new TimerCoordinator(repository, { now: () => times.shift()! });

    await coordinator.start('first');
    await coordinator.switchTo('second');

    expect(repository.entries).toHaveLength(2);
    expect(repository.entries[0]?.endedAt).toBe('2026-07-15T09:00:00.000Z');
    expect(coordinator.getSnapshot().running?.taskId).toBe('second');
  });

  it('stops at an explicitly supplied timestamp', async () => {
    const repository = new FakeTimerRepository();
    const coordinator = new TimerCoordinator(repository, {
      now: () => new Date('2026-07-15T08:00:00.000Z'),
    });
    await coordinator.start('first');

    await coordinator.stop({ endedAt: new Date('2026-07-15T08:30:00.000Z') });

    expect(repository.entries[0]?.endedAt).toBe('2026-07-15T08:30:00.000Z');
    expect(coordinator.getSnapshot().running).toBeNull();
  });
});
