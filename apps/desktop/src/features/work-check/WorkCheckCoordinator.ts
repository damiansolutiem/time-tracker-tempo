import type { RunningTimer, WorkCheckSettings, WorkCheckState } from '@time-tracker/domain';
import type { WorkCheckRepository } from './workCheckRepository';

type Clock = { now(): Date };
type RunningProvider = { getRunning(): Promise<RunningTimer | null> };

export type WorkCheckReconcileResult = {
  state: WorkCheckState;
  changed: boolean;
  expired: boolean;
};

const idle: WorkCheckState = { status: 'idle', entryId: null, deadline: null, reason: null };

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export class WorkCheckCoordinator {
  constructor(
    private readonly entries: RunningProvider,
    private readonly repository: WorkCheckRepository,
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  async reconcile(settings: WorkCheckSettings): Promise<WorkCheckReconcileResult> {
    const now = this.clock.now();
    let changed = false;
    let running = await this.entries.getRunning();
    if (!running) return { state: idle, changed: false, expired: false };

    if (!settings.enabled) {
      const changed = running.checkDueAt !== null || running.verificationState === 'pending';
      if (changed) await this.repository.clear(running.id, now.toISOString());
      return { state: idle, changed, expired: false };
    }

    if (!running.checkDueAt) {
      const anchor = new Date(running.startedAt);
      const deadline = addMinutes(anchor, settings.intervalMinutes).toISOString();
      await this.repository.schedule(running.id, deadline, now.toISOString());
      changed = true;
      running = { ...running, checkDueAt: deadline, verificationState: 'confirmed' };
    }

    const deadline = new Date(running.checkDueAt!);
    if (now < deadline && running.verificationState === 'confirmed') {
      return {
        state: {
          status: 'scheduled',
          entryId: running.id,
          deadline: deadline.toISOString(),
          reason: 'interval',
        },
        changed,
        expired: false,
      };
    }

    const graceEnd = addMinutes(deadline, settings.graceMinutes);
    if (now >= graceEnd) {
      if (running.verificationState === 'confirmed') {
        await this.repository.markPending(running.id, now.toISOString());
      }
      const expired = await this.repository.expire(
        running.id,
        deadline.toISOString(),
        now.toISOString(),
      );
      return { state: idle, changed: true, expired };
    }

    const markedPending =
      running.verificationState === 'confirmed'
        ? await this.repository.markPending(running.id, now.toISOString())
        : false;
    return {
      state: {
        status: 'pending',
        entryId: running.id,
        deadline: deadline.toISOString(),
        reason: 'interval',
      },
      changed: changed || markedPending,
      expired: false,
    };
  }

  async confirm(entryId: string, settings: WorkCheckSettings): Promise<boolean> {
    const now = this.clock.now();
    const running = await this.entries.getRunning();
    if (!running || running.id !== entryId || !running.checkDueAt) return false;
    const graceEnd = addMinutes(new Date(running.checkDueAt), settings.graceMinutes);
    if (now >= graceEnd) {
      await this.reconcile(settings);
      return false;
    }
    return this.repository.confirm(
      entryId,
      now.toISOString(),
      addMinutes(now, settings.intervalMinutes).toISOString(),
    );
  }

  async recover(settings: WorkCheckSettings): Promise<WorkCheckReconcileResult> {
    const running = await this.entries.getRunning();
    if (!running) return { state: idle, changed: false, expired: false };
    if (!settings.enabled) return this.reconcile(settings);
    const now = this.clock.now();
    if (
      running.verificationState === 'pending' ||
      (running.checkDueAt && now >= new Date(running.checkDueAt))
    ) {
      return this.reconcile(settings);
    }
    const recoveredAt = now.toISOString();
    await this.repository.schedule(running.id, recoveredAt, recoveredAt);
    await this.repository.markPending(running.id, recoveredAt);
    return {
      state: {
        status: 'pending',
        entryId: running.id,
        deadline: recoveredAt,
        reason: 'recovery',
      },
      changed: true,
      expired: false,
    };
  }

  async resetSchedule(settings: WorkCheckSettings): Promise<WorkCheckReconcileResult> {
    const running = await this.entries.getRunning();
    if (!running) return { state: idle, changed: false, expired: false };
    const now = this.clock.now();
    if (!settings.enabled) {
      await this.repository.clear(running.id, now.toISOString());
      return { state: idle, changed: true, expired: false };
    }
    const deadline = addMinutes(now, settings.intervalMinutes).toISOString();
    await this.repository.schedule(running.id, deadline, now.toISOString());
    return {
      state: { status: 'scheduled', entryId: running.id, deadline, reason: 'interval' },
      changed: true,
      expired: false,
    };
  }
}
