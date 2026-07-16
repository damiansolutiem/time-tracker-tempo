import { invoke } from '@tauri-apps/api/core';
import { confirm, open, save } from '@tauri-apps/plugin-dialog';
import { withDatabaseClosed } from './database/client';

export type ExportFormat = 'csv' | 'json' | 'xlsx';
export type TaskExportFormat = 'csv' | 'xlsx';

export async function saveReportExport(
  format: ExportFormat,
  contents: string | ArrayBuffer,
  suggestedName: string,
) {
  const path = await save({
    title: `Export Tempo report as ${format.toUpperCase()}`,
    defaultPath: suggestedName,
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (!path) return null;
  if (typeof contents === 'string') await invoke('write_export_file', { path, contents });
  else {
    await invoke('write_binary_export_file', {
      path,
      contents: Array.from(new Uint8Array(contents)),
    });
  }
  return path;
}

export async function saveTaskExport(
  format: TaskExportFormat,
  contents: string | ArrayBuffer,
  suggestedName: string,
) {
  const path = await save({
    title: `Export Tempo tasks as ${format.toUpperCase()}`,
    defaultPath: suggestedName,
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  });
  if (!path) return null;
  if (typeof contents === 'string') await invoke('write_export_file', { path, contents });
  else
    await invoke('write_binary_export_file', {
      path,
      contents: Array.from(new Uint8Array(contents)),
    });
  return path;
}

export async function createDatabaseBackup(suggestedName: string) {
  const destination = await save({
    title: 'Back up Tempo database',
    defaultPath: suggestedName,
    filters: [{ name: 'Tempo database', extensions: ['db'] }],
  });
  if (!destination) return null;
  await withDatabaseClosed(() => invoke('backup_database', { destination }));
  return destination;
}

export async function chooseAndRestoreDatabase() {
  const source = await open({
    title: 'Restore a Tempo database',
    multiple: false,
    directory: false,
    filters: [{ name: 'Tempo database', extensions: ['db', 'sqlite', 'sqlite3'] }],
  });
  if (!source) return null;
  const accepted = await confirm(
    'Restoring replaces the active Tempo database and restarts the app. The current database will be preserved as an automatic safety backup.',
    { title: 'Restore Tempo database?', kind: 'warning' },
  );
  if (!accepted) return null;
  const safetyBackup = await withDatabaseClosed(() =>
    invoke<string>('restore_database', { source }),
  );
  void invoke('restart_app');
  return safetyBackup;
}
