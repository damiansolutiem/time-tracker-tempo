import { isTauri } from '@tauri-apps/api/core';
import { appStore } from '../app/store';
import { isAutostartLaunch } from './autostart';
import { TrayController } from './tray/TrayController';
import { initializeMainWindowLifecycle, showMainWindow } from './windows/mainWindow';
import { WorkCheckWindowController } from './windows/WorkCheckWindowController';
import { WorkdayReminderController } from './notifications/WorkdayReminderController';

export async function initializeDesktopIntegrations() {
  if (!isTauri()) return;
  await initializeMainWindowLifecycle();
  await appStore.initialize();
  if (!(await isAutostartLaunch())) await showMainWindow();
  await Promise.all([
    new TrayController(appStore).initialize(),
    new WorkCheckWindowController(appStore).initialize(),
    new WorkdayReminderController(appStore).initialize(),
  ]);
}
