import { isTauri, invoke } from '@tauri-apps/api/core';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';

export async function isAutostartLaunch() {
  if (!isTauri()) return false;
  return invoke<boolean>('is_autostart_launch');
}

export async function getLaunchAtLogin() {
  if (!isTauri()) return false;
  return isEnabled();
}

export async function setLaunchAtLogin(enabled: boolean) {
  if (!isTauri()) throw new Error('Launch at login is only available in the desktop app.');
  if (enabled) await enable();
  else await disable();
  return isEnabled();
}
