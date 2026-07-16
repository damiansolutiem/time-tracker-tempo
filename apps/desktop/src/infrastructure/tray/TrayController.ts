import { Image } from '@tauri-apps/api/image';
import { invoke } from '@tauri-apps/api/core';
import { Menu, type MenuOptions } from '@tauri-apps/api/menu';
import { TrayIcon, type TrayIconEvent } from '@tauri-apps/api/tray';
import type { AppSnapshot, appStore } from '../../app/store';
import { showMainWindow } from '../windows/mainWindow';
import { liveTotal } from '../../features/timer/time';
import {
  formatTrayTaskLabel,
  formatTrayTitle,
  formatTrayTooltip,
  truncateTrayTaskTitle,
} from './trayFormatting';
import { createTrayIconRgba } from './trayIcon';

const TRAY_ID = 'tempo-main';
type Store = typeof appStore;

export class TrayController {
  private tray: TrayIcon | null = null;
  private menu: Menu | null = null;
  private currentItem: Awaited<ReturnType<Menu['get']>> = null;
  private tick: number | null = null;
  private menuRefreshRequested = false;
  private menuRefreshRunning = false;

  constructor(private readonly store: Store) {}

  async initialize() {
    await this.store.initialize();
    await TrayIcon.removeById(TRAY_ID).catch(() => undefined);
    const icon = await Image.new(createTrayIconRgba(), 32, 32);
    this.tray = await TrayIcon.new({
      id: TRAY_ID,
      icon,
      iconAsTemplate: true,
      showMenuOnLeftClick: true,
      action: (event) => this.handleTrayEvent(event),
    });
    await this.rebuildMenu();
    await this.updateStatus();
    this.store.subscribe(() => {
      this.queueMenuRefresh();
      void this.updateStatus();
    });
    this.tick = window.setInterval(() => void this.updateStatus(), 1000);
  }

  private handleTrayEvent(event: TrayIconEvent) {
    if (event.type === 'Click' && event.buttonState === 'Up') {
      void this.store.reconcile().catch(console.error);
    }
  }

  private queueMenuRefresh() {
    this.menuRefreshRequested = true;
    if (this.menuRefreshRunning) return;
    void this.drainMenuRefreshes();
  }

  private async drainMenuRefreshes() {
    this.menuRefreshRunning = true;
    try {
      while (this.menuRefreshRequested) {
        this.menuRefreshRequested = false;
        await this.rebuildMenu();
      }
    } catch (error) {
      console.error(error);
    } finally {
      this.menuRefreshRunning = false;
    }
  }

  private async rebuildMenu() {
    if (!this.tray) return;
    const snapshot = this.store.getSnapshot();
    const items: NonNullable<MenuOptions['items']> = [
      {
        id: 'current-timer',
        text: this.currentText(snapshot),
        enabled: false,
      },
    ];
    if (snapshot.timer.running) {
      items.push({
        id: 'stop-timer',
        text: 'Stop current task',
        action: () => void this.store.stopTimer().catch(console.error),
      });
    } else if (snapshot.classificationTimer.running) {
      items.push({
        id: 'stop-break',
        text: 'End break',
        action: () => void this.store.stopBreak().catch(console.error),
      });
    } else {
      items.push({
        id: 'start-break',
        text: 'Start break',
        action: () => void this.store.startBreak().catch(console.error),
      });
    }
    items.push({ item: 'Separator' });
    if (snapshot.recentTasks.length) {
      items.push({ text: snapshot.timer.running ? 'Switch task' : 'Start task', enabled: false });
      for (const task of snapshot.recentTasks) {
        const active = snapshot.timer.running?.taskId === task.id;
        const group = snapshot.groups.find((item) => item.id === task.groupId);
        const label = group ? `${group.name} · ${task.title}` : task.title;
        items.push({
          id: `task:${task.id}`,
          text: `${active ? '✓ ' : ''}${truncateTrayTaskTitle(label, 34)}`,
          enabled: !active,
          action: () => void this.store.startTask(task.id).catch(console.error),
        });
      }
      items.push({ item: 'Separator' });
    }
    items.push(
      {
        id: 'open-tempo',
        text: 'Open Tempo',
        action: () => void showMainWindow().catch(console.error),
      },
      { item: 'Quit', text: 'Quit Tempo' },
    );

    const nextMenu = await Menu.new({ items });
    const previousMenu = this.menu;
    this.menu = nextMenu;
    this.currentItem = await nextMenu.get('current-timer');
    await this.tray.setMenu(nextMenu);
    await previousMenu?.close();
  }

  private async updateStatus() {
    if (!this.tray) return;
    const snapshot = this.store.getSnapshot();
    const now = Date.now();
    const confirmationPending = snapshot.workCheck.status === 'pending';
    const mode =
      snapshot.timer.running && snapshot.trayTimeModeOverride?.entryId === snapshot.timer.running.id
        ? snapshot.trayTimeModeOverride.mode
        : snapshot.trayTimeModeDefault;
    const displayedDurationMs =
      mode === 'task-total' && snapshot.timer.running
        ? liveTotal(snapshot.currentTaskTotalMs, snapshot.totalCapturedAt, now, true)
        : undefined;
    const runningClassification = snapshot.classificationTimer.running;
    const breakDuration = runningClassification
      ? Math.max(0, now - new Date(runningClassification.startedAt).getTime())
      : 0;
    const breakTitle = runningClassification
      ? `Break · ${Math.floor(breakDuration / 3_600_000)
          .toString()
          .padStart(2, '0')}:${Math.floor((breakDuration % 3_600_000) / 60_000)
          .toString()
          .padStart(2, '0')}:${Math.floor((breakDuration % 60_000) / 1000)
          .toString()
          .padStart(2, '0')}`
      : null;
    const title = breakTitle ?? formatTrayTitle(snapshot.timer.running, now, displayedDurationMs);
    const taskTitle = snapshot.timer.running ? formatTrayTaskLabel(snapshot.timer.running) : null;
    await Promise.all([
      invoke('set_status_title', {
        title,
        taskUtf16Length: taskTitle?.length ?? 0,
        elapsedUtf16Start: taskTitle ? taskTitle.length + 3 : 0,
        confirmationPending,
      }),
      this.tray.setTooltip(
        breakTitle ??
          formatTrayTooltip(snapshot.timer.running, now, confirmationPending, displayedDurationMs),
      ),
      this.currentItem && 'setText' in this.currentItem
        ? this.currentItem.setText(this.currentText(snapshot, now, displayedDurationMs))
        : Promise.resolve(),
    ]);
  }

  private currentText(snapshot: AppSnapshot, now = Date.now(), displayedDurationMs?: number) {
    if (snapshot.classificationTimer.running) {
      const duration = Math.max(
        0,
        now - new Date(snapshot.classificationTimer.running.startedAt).getTime(),
      );
      const hours = Math.floor(duration / 3_600_000)
        .toString()
        .padStart(2, '0');
      const minutes = Math.floor((duration % 3_600_000) / 60_000)
        .toString()
        .padStart(2, '0');
      const seconds = Math.floor((duration % 60_000) / 1000)
        .toString()
        .padStart(2, '0');
      return `Break · ${hours}:${minutes}:${seconds}`;
    }
    return formatTrayTitle(snapshot.timer.running, now, displayedDurationMs) ?? 'No task running';
  }
}
