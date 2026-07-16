import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { appStore } from '../../app/store';
import {
  WORK_CHECK_ACTION,
  WORK_CHECK_READY,
  WORK_CHECK_STATE,
  type WorkCheckAction,
  type WorkCheckWindowState,
} from '../../features/work-check/events';
import { notifyWorkCheck } from '../notifications/notifications';

const LABEL = 'work-check';
type Store = typeof appStore;

function workCheckUrl() {
  const url = new URL(window.location.href);
  url.pathname = '/';
  url.search = 'window=work-check';
  url.hash = '';
  return url.toString();
}

export class WorkCheckWindowController {
  private presentedKey: string | null = null;
  private dismissedKey: string | null = null;
  private interval: number | null = null;
  private syncing = false;
  private syncRequested = false;

  constructor(private readonly store: Store) {}

  async initialize() {
    const mainWindow = getCurrentWindow();
    await mainWindow.listen(WORK_CHECK_READY, () => void this.sendState());
    await mainWindow.listen<WorkCheckAction>(WORK_CHECK_ACTION, ({ payload }) => {
      void this.handleAction(payload).catch(console.error);
    });
    this.store.subscribe(() => void this.sync());
    const reconcile = () => void this.store.reconcile().catch(console.error);
    window.addEventListener('focus', reconcile);
    window.addEventListener('pageshow', reconcile);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reconcile();
    });
    this.interval = window.setInterval(reconcile, 15_000);
    await this.store.initialize();
    await this.store.reconcile();
    await this.sync();
  }

  private async sync() {
    this.syncRequested = true;
    if (this.syncing) return;
    this.syncing = true;
    try {
      while (this.syncRequested) {
        this.syncRequested = false;
        const payload = this.payload();
        const existing = await WebviewWindow.getByLabel(LABEL);
        if (!payload) {
          this.presentedKey = null;
          this.dismissedKey = null;
          if (existing) await invoke('close_work_check_window');
          continue;
        }

        const key = `${payload.entryId}:${payload.deadline}`;
        if (existing) {
          await existing.emit(WORK_CHECK_STATE, payload);
        } else if (this.dismissedKey === key) {
          continue;
        } else {
          const confirmation = new WebviewWindow(LABEL, {
            url: workCheckUrl(),
            title: 'Tempo — Work confirmation',
            width: 440,
            height: 570,
            minWidth: 400,
            minHeight: 520,
            center: true,
            resizable: false,
            maximizable: false,
            minimizable: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            focus: true,
          });
          await new Promise<void>((resolve, reject) => {
            void confirmation.once('tauri://created', () => resolve());
            void confirmation.once<{ message?: string }>('tauri://error', ({ payload: error }) =>
              reject(new Error(error.message ?? 'Could not open work confirmation.')),
            );
          });
          await confirmation.onCloseRequested(() => {
            this.dismissedKey = key;
          });
        }
        if (this.presentedKey !== key) {
          this.presentedKey = key;
          if (this.store.getSnapshot().workCheckSettings.notificationsEnabled) {
            await notifyWorkCheck(payload.taskTitle);
          }
        }
      }
    } finally {
      this.syncing = false;
    }
  }

  private async sendState() {
    const payload = this.payload();
    if (!payload) return;
    const window = await WebviewWindow.getByLabel(LABEL);
    await window?.emit(WORK_CHECK_STATE, payload);
  }

  private payload(): WorkCheckWindowState | null {
    const snapshot = this.store.getSnapshot();
    const running = snapshot.timer.running;
    const check = snapshot.workCheck;
    if (!running || check.status !== 'pending' || check.entryId !== running.id || !check.deadline) {
      return null;
    }
    return {
      entryId: running.id,
      taskTitle: running.task.title,
      startedAt: running.startedAt,
      deadline: check.deadline,
      graceEndsAt: new Date(
        new Date(check.deadline).getTime() + snapshot.workCheckSettings.graceMinutes * 60_000,
      ).toISOString(),
      reason: check.reason ?? 'interval',
      tasks: snapshot.tasks
        .filter((task) => task.id !== running.taskId)
        .map(({ id, externalId, groupId, title }) => ({
          id,
          externalId,
          title,
          groupName: snapshot.groups.find((group) => group.id === groupId)?.name ?? null,
        })),
    };
  }

  private async handleAction(action: WorkCheckAction) {
    const current = this.payload();
    if (!current || current.entryId !== action.entryId) return;
    this.dismissedKey = `${current.entryId}:${current.deadline}`;
    if (action.type === 'confirm') await this.store.confirmWork(action.entryId);
    if (action.type === 'stop') await this.store.stopTimer(action.entryId);
    if (action.type === 'switch') await this.store.startTask(action.taskId, action.entryId);
    await invoke('close_work_check_window');
  }
}
