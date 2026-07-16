import Database from '@tauri-apps/plugin-sql';
import { migrations } from './migrations';

const DATABASE_URL =
  import.meta.env.VITE_APP_FLAVOR === 'development' || import.meta.env.DEV
    ? 'sqlite:tempo-dev.db'
    : 'sqlite:tempo.db';

let databasePromise: ReturnType<typeof connectDatabase> | null = null;
let maintenanceGate: Promise<void> | null = null;

async function connectDatabase() {
  const database = await Database.load(DATABASE_URL);
  await database.execute('PRAGMA foreign_keys = ON');

  await database.execute(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
  );

  const applied = await database.select<{ version: number }[]>(
    'SELECT version FROM schema_migrations',
  );
  const appliedVersions = new Set(applied.map(({ version }) => version));

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) continue;
    // SQLite DDL is idempotent; the version is recorded only after all statements succeed.
    for (const statement of migration.statements) await database.execute(statement);
    await database.execute('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)', [
      migration.version,
      new Date().toISOString(),
    ]);
  }

  return database;
}

export async function openDatabase() {
  if (maintenanceGate) await maintenanceGate;
  databasePromise ??= connectDatabase();
  return databasePromise;
}

async function closeDatabase() {
  const pending = databasePromise;
  databasePromise = null;
  if (!pending) return;
  const database = await pending;
  await database.execute('PRAGMA wal_checkpoint(FULL)').catch(() => undefined);
  await database.close();
}

export async function withDatabaseClosed<T>(operation: () => Promise<T>) {
  if (maintenanceGate) throw new Error('Another database operation is already in progress.');
  let release: () => void = () => undefined;
  maintenanceGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await closeDatabase();
    return await operation();
  } finally {
    maintenanceGate = null;
    release();
  }
}
