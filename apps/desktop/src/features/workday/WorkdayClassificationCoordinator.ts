import type { WorkdayClassification, WorkdayClassificationSnapshot } from '@time-tracker/domain';
import type { WorkdayClassificationRepository } from './workdayClassificationRepository';

type Clock = { now(): Date };
type Listener = () => void;

export class WorkdayClassificationCoordinator {
  private snapshot: WorkdayClassificationSnapshot = {
    status: 'loading',
    running: null,
    error: null,
  };
  private operation: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly repository: WorkdayClassificationRepository,
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  initialize() {
    return this.run(() => this.repository.getRunning());
  }
  refresh() {
    return this.run(() => this.repository.getRunning());
  }

  async startBreak(at = this.clock.now()) {
    await this.enqueue(async () => {
      await this.repository.create({
        category: 'break',
        startedAt: at.toISOString(),
        endedAt: null,
        note: null,
      });
      return this.repository.getRunning();
    });
  }

  async stop(at = this.clock.now()) {
    await this.enqueue(async () => {
      await this.repository.stop(at.toISOString());
      return this.repository.getRunning();
    });
  }

  private async enqueue(operation: () => Promise<WorkdayClassification | null>) {
    const next = this.operation.then(() => this.run(operation));
    this.operation = next.catch(() => undefined);
    await next;
  }

  private async run(operation: () => Promise<WorkdayClassification | null>) {
    try {
      this.setSnapshot({ status: 'ready', running: await operation(), error: null });
    } catch (error) {
      this.setSnapshot({
        status: 'error',
        running: this.snapshot.running,
        error: error instanceof Error ? error.message : 'Unexpected classification error.',
      });
      throw error;
    }
  }

  private setSnapshot(snapshot: WorkdayClassificationSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}
