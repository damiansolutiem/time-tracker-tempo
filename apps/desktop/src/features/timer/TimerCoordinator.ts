import type { RunningTimer, TimerSnapshot } from '@time-tracker/domain';
import type { TimerRepository } from './timeEntryRepository';

type Listener = () => void;
type Clock = { now(): Date };

const initialSnapshot: TimerSnapshot = { status: 'loading', running: null, error: null };

export class TimerCoordinator {
  private snapshot: TimerSnapshot = initialSnapshot;
  private readonly listeners = new Set<Listener>();
  private operation: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: TimerRepository,
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  getSnapshot = () => this.snapshot;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async initialize() {
    await this.run(async () => this.repository.getRunning());
  }

  async refresh() {
    await this.run(async () => this.repository.getRunning());
  }

  async start(taskId: string, options?: { expectedEntryId?: string; startedAt?: Date }) {
    await this.enqueue(async () => {
      await this.repository.start(
        taskId,
        (options?.startedAt ?? this.clock.now()).toISOString(),
        options?.expectedEntryId,
      );
      return this.repository.getRunning();
    });
  }

  async stop(options?: { endedAt?: Date; expectedEntryId?: string }) {
    await this.enqueue(async () => {
      await this.repository.stop(
        (options?.endedAt ?? this.clock.now()).toISOString(),
        options?.expectedEntryId,
      );
      return this.repository.getRunning();
    });
  }

  async switchTo(taskId: string) {
    await this.start(taskId);
  }

  private async enqueue(operation: () => Promise<RunningTimer | null>) {
    const next = this.operation.then(() => this.run(operation));
    this.operation = next.catch(() => undefined);
    await next;
  }

  private async run(operation: () => Promise<RunningTimer | null>) {
    try {
      this.setSnapshot({ status: 'ready', running: await operation(), error: null });
    } catch (error) {
      this.setSnapshot({
        status: 'error',
        running: this.snapshot.running,
        error: error instanceof Error ? error.message : 'Unexpected timer error.',
      });
      throw error;
    }
  }

  private setSnapshot(snapshot: TimerSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}
