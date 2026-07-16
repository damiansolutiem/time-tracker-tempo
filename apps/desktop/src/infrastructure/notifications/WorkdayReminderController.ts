import type { appStore } from '../../app/store';
import { notifyWorkdayGap } from './notifications';

export class WorkdayReminderController {
  private interval: number | null = null;

  constructor(private readonly store: typeof appStore) {}

  async initialize() {
    await this.reconcile();
    this.interval = window.setInterval(() => void this.reconcile(), 15_000);
  }

  private async reconcile() {
    try {
      const shouldNotify = await this.store.reconcileWorkdayReminder();
      if (shouldNotify) {
        const duration = this.store.getSnapshot().workdayReminder.durationMs;
        await notifyWorkdayGap(duration / 60_000);
      }
    } catch (error) {
      console.error(error);
    }
  }
}
