import type { RunningTimer, Task, WorkCheckSettings } from '@time-tracker/domain';
import { describe, expect, it } from 'vitest';
import { WorkCheckCoordinator } from './WorkCheckCoordinator';
import type { WorkCheckRepository } from './workCheckRepository';

const task: Task = {
  id: 'task',
  externalId: null,
  groupId: null,
  category: null,
  tags: [],
  title: 'Focused work',
  description: null,
  color: null,
  archivedAt: null,
  createdAt: '2026-07-15T08:00:00.000Z',
  updatedAt: '2026-07-15T08:00:00.000Z',
};

const settings: WorkCheckSettings = {
  enabled: true,
  intervalMinutes: 60,
  graceMinutes: 5,
  notificationsEnabled: true,
};

function running(overrides: Partial<RunningTimer> = {}): RunningTimer {
  return {
    id: 'entry',
    taskId: task.id,
    groupId: null,
    category: null,
    tags: [],
    startedAt: '2026-07-15T08:00:00.000Z',
    endedAt: null,
    note: null,
    confirmedAt: '2026-07-15T08:00:00.000Z',
    checkDueAt: null,
    verificationState: 'confirmed',
    notes: [],
    task,
    group: null,
    ...overrides,
  };
}

class FakeRepository implements WorkCheckRepository {
  constructor(public entry: RunningTimer | null) {}

  schedule(entryId: string, deadline: string) {
    if (!this.entry || this.entry.id !== entryId) return Promise.resolve(false);
    this.entry.checkDueAt = deadline;
    this.entry.verificationState = 'confirmed';
    return Promise.resolve(true);
  }

  markPending(entryId: string) {
    if (!this.entry || this.entry.id !== entryId || this.entry.verificationState !== 'confirmed') {
      return Promise.resolve(false);
    }
    this.entry.verificationState = 'pending';
    return Promise.resolve(true);
  }

  confirm(entryId: string, confirmedAt: string, nextDeadline: string) {
    if (!this.entry || this.entry.id !== entryId || this.entry.verificationState !== 'pending') {
      return Promise.resolve(false);
    }
    this.entry.confirmedAt = confirmedAt;
    this.entry.checkDueAt = nextDeadline;
    this.entry.verificationState = 'confirmed';
    return Promise.resolve(true);
  }

  expire(entryId: string, deadline: string) {
    if (!this.entry || this.entry.id !== entryId || this.entry.verificationState !== 'pending') {
      return Promise.resolve(false);
    }
    this.entry.endedAt = deadline;
    this.entry = null;
    return Promise.resolve(true);
  }

  clear(entryId: string) {
    if (!this.entry || this.entry.id !== entryId) return Promise.resolve(false);
    this.entry.checkDueAt = null;
    this.entry.verificationState = 'confirmed';
    return Promise.resolve(true);
  }

  getRunning = () => Promise.resolve(this.entry);
}

function coordinator(repository: FakeRepository, now: string) {
  return new WorkCheckCoordinator(repository, repository, { now: () => new Date(now) });
}

describe('WorkCheckCoordinator', () => {
  it('persists the first deadline from the timer start timestamp', async () => {
    const repository = new FakeRepository(running());
    const result = await coordinator(repository, '2026-07-15T08:10:00.000Z').reconcile(settings);

    expect(repository.entry?.checkDueAt).toBe('2026-07-15T09:00:00.000Z');
    expect(result.state.status).toBe('scheduled');
  });

  it('marks a due timer pending throughout the grace period', async () => {
    const repository = new FakeRepository(running({ checkDueAt: '2026-07-15T09:00:00.000Z' }));
    const result = await coordinator(repository, '2026-07-15T09:03:00.000Z').reconcile(settings);

    expect(repository.entry?.verificationState).toBe('pending');
    expect(result.state).toEqual({
      status: 'pending',
      entryId: 'entry',
      deadline: '2026-07-15T09:00:00.000Z',
      reason: 'interval',
    });
  });

  it('confirmation includes grace time and restarts the check countdown', async () => {
    const repository = new FakeRepository(
      running({
        checkDueAt: '2026-07-15T09:00:00.000Z',
        verificationState: 'pending',
      }),
    );
    const confirmed = await coordinator(repository, '2026-07-15T09:04:00.000Z').confirm(
      'entry',
      settings,
    );

    expect(confirmed).toBe(true);
    expect(repository.entry?.confirmedAt).toBe('2026-07-15T09:04:00.000Z');
    expect(repository.entry?.checkDueAt).toBe('2026-07-15T10:04:00.000Z');
  });

  it('expires exactly at the original deadline after grace elapses', async () => {
    const repository = new FakeRepository(
      running({
        checkDueAt: '2026-07-15T09:00:00.000Z',
        verificationState: 'pending',
      }),
    );
    const result = await coordinator(repository, '2026-07-15T09:05:00.000Z').reconcile(settings);

    expect(result.expired).toBe(true);
    expect(result.state.status).toBe('idle');
    expect(repository.entry).toBeNull();
  });

  it('restores a confirmed timer after restart and expires it at its saved deadline', async () => {
    const entry = running({ checkDueAt: '2026-07-15T09:00:00.000Z' });
    const repository = new FakeRepository(entry);
    const result = await coordinator(repository, '2026-07-15T11:30:00.000Z').reconcile(settings);

    expect(result.expired).toBe(true);
    expect(entry.endedAt).toBe('2026-07-15T09:00:00.000Z');
  });

  it('clears pending state without stopping when checks are disabled', async () => {
    const repository = new FakeRepository(
      running({
        checkDueAt: '2026-07-15T09:00:00.000Z',
        verificationState: 'pending',
      }),
    );
    const result = await coordinator(repository, '2026-07-15T09:02:00.000Z').reconcile({
      ...settings,
      enabled: false,
    });

    expect(result.state.status).toBe('idle');
    expect(repository.entry?.endedAt).toBeNull();
    expect(repository.entry?.checkDueAt).toBeNull();
    expect(repository.entry?.verificationState).toBe('confirmed');
  });

  it('restarts the countdown from now when the interval changes', async () => {
    const repository = new FakeRepository(running({ checkDueAt: '2026-07-15T09:00:00.000Z' }));
    const result = await coordinator(repository, '2026-07-15T10:20:00.000Z').resetSchedule({
      ...settings,
      intervalMinutes: 30,
    });

    expect(result.state.deadline).toBe('2026-07-15T10:50:00.000Z');
    expect(repository.entry?.endedAt).toBeNull();
  });

  it('requires confirmation when a running timer is recovered in a new runtime', async () => {
    const repository = new FakeRepository(running({ checkDueAt: '2026-07-15T12:00:00.000Z' }));
    const result = await coordinator(repository, '2026-07-15T10:30:00.000Z').recover(settings);

    expect(result.state).toEqual({
      status: 'pending',
      entryId: 'entry',
      deadline: '2026-07-15T10:30:00.000Z',
      reason: 'recovery',
    });
    expect(repository.entry?.verificationState).toBe('pending');
  });

  it('preserves an existing pending deadline during recovery', async () => {
    const repository = new FakeRepository(
      running({
        checkDueAt: '2026-07-15T10:29:00.000Z',
        verificationState: 'pending',
      }),
    );
    const result = await coordinator(repository, '2026-07-15T10:30:00.000Z').recover(settings);

    expect(result.state.deadline).toBe('2026-07-15T10:29:00.000Z');
  });
});
