import { isTauri } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

export type NotificationPermission = 'unknown' | 'granted' | 'denied';

export async function getNotificationPermission(): Promise<NotificationPermission> {
  if (!isTauri()) return 'unknown';
  return (await isPermissionGranted()) ? 'granted' : 'denied';
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isTauri()) return 'unknown';
  if (await isPermissionGranted()) return 'granted';
  return (await requestPermission()) === 'granted' ? 'granted' : 'denied';
}

export async function notifyWorkCheck(taskTitle: string) {
  if (!isTauri() || !(await isPermissionGranted())) return false;
  sendNotification({
    title: 'Are you still working?',
    body: `${taskTitle} needs confirmation.`,
    sound: 'Ping',
  });
  return true;
}

export async function notifyWorkdayGap(minutes: number) {
  if (!isTauri() || !(await isPermissionGranted())) return false;
  sendNotification({
    title: 'Tempo · No task running',
    body: `${Math.max(1, Math.round(minutes))} minutes of planned time are currently untracked.`,
  });
  return true;
}
