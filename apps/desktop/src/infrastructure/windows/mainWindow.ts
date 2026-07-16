import { show as showApplication } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { appStore } from '../../app/store';

export async function showMainWindow() {
  const window = getCurrentWindow();
  await showApplication();
  await window.unminimize();
  await window.show();
  await window.setFocus();
  await appStore.reconcile();
}

export async function initializeMainWindowLifecycle() {
  const window = getCurrentWindow();
  await window.onCloseRequested(async (event) => {
    event.preventDefault();
    await window.hide();
  });
  await window.onFocusChanged(({ payload: focused }) => {
    if (focused) void appStore.reconcile().catch(console.error);
  });
}
