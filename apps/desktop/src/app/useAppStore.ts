import { useEffect, useSyncExternalStore } from 'react';
import { appStore } from './store';

export function useAppStore() {
  const snapshot = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot);
  useEffect(() => {
    void appStore.initialize();
  }, []);
  return { snapshot, actions: appStore };
}
