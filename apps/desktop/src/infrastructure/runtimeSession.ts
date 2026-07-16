import { invoke, isTauri } from '@tauri-apps/api/core';

const browserSessionId = crypto.randomUUID();

export function getRuntimeSessionId() {
  return isTauri() ? invoke<string>('get_runtime_session_id') : Promise.resolve(browserSessionId);
}
