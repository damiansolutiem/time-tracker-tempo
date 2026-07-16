import type {
  ThemeMode,
  TrayTimeMode,
  WorkCheckSettings,
  WorkdayReminderSettings,
} from '@time-tracker/domain';
import { ChevronRight, DatabaseBackup, FileOutput, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { appStore } from '../../app/store';
import {
  chooseAndRestoreDatabase,
  createDatabaseBackup,
} from '../../infrastructure/dataPortability';
import { getLaunchAtLogin, setLaunchAtLogin } from '../../infrastructure/autostart';
import { localDateKey } from '../history/day';
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermission,
} from '../../infrastructure/notifications/notifications';
import { useTheme } from '../../theme/ThemeProvider';

type Props = {
  settings: WorkCheckSettings;
  reminderSettings: WorkdayReminderSettings;
  trayTimeModeDefault: TrayTimeMode;
  actions: typeof appStore;
  onConfigureExports: () => void;
};

export function SettingsPage({
  settings,
  reminderSettings,
  trayTimeModeDefault,
  actions,
  onConfigureExports,
}: Props) {
  const { mode, setMode } = useTheme();
  const [draft, setDraft] = useState(settings);
  const [reminderDraft, setReminderDraft] = useState(reminderSettings);
  const [reminderSaved, setReminderSaved] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('unknown');
  const [saved, setSaved] = useState(false);
  const [launchAtLogin, setLaunchAtLoginState] = useState<boolean | null>(null);
  const [savingLaunchAtLogin, setSavingLaunchAtLogin] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [dataOperation, setDataOperation] = useState<'backup' | 'restore' | null>(null);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => setReminderDraft(reminderSettings), [reminderSettings]);
  useEffect(() => {
    void getNotificationPermission().then(setPermission);
  }, []);
  useEffect(() => {
    void getLaunchAtLogin()
      .then(setLaunchAtLoginState)
      .catch((error) => setLaunchError(error instanceof Error ? error.message : String(error)));
  }, []);

  async function save() {
    await actions.updateWorkCheckSettings(draft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }

  async function updateLaunchAtLogin(enabled: boolean) {
    setSavingLaunchAtLogin(true);
    setLaunchError(null);
    try {
      setLaunchAtLoginState(await setLaunchAtLogin(enabled));
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingLaunchAtLogin(false);
    }
  }

  async function backup() {
    setDataOperation('backup');
    setDataMessage(null);
    setDataError(null);
    try {
      const path = await createDatabaseBackup(`tempo-backup-${localDateKey()}.db`);
      if (path) setDataMessage('Database backup saved successfully.');
    } catch (error) {
      setDataError(error instanceof Error ? error.message : String(error));
    } finally {
      setDataOperation(null);
    }
  }

  async function restore() {
    setDataOperation('restore');
    setDataMessage(null);
    setDataError(null);
    try {
      const restored = await chooseAndRestoreDatabase();
      if (!restored) setDataOperation(null);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : String(error));
      setDataOperation(null);
    }
  }
  return (
    <div className="mx-auto w-full max-w-5xl px-10 py-9">
      <h1 className="m-0 text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-2 text-sm text-surface-muted-foreground">
        Control your work schedule, appearance, timer safeguards, and local data.
      </p>
      <section className="mt-8 rounded-2xl border bg-card p-7 shadow-[var(--shadow)]">
        <h2 className="m-0 text-lg font-semibold">Appearance</h2>
        <p className="mt-1 text-sm text-surface-muted-foreground">
          Tempo follows your Mac by default.
        </p>
        <label
          className="mt-5 mb-2 block text-xs font-semibold uppercase tracking-wider text-surface-muted-foreground"
          htmlFor="theme"
        >
          Theme
        </label>
        <select
          id="theme"
          value={mode}
          onChange={(event) => setMode(event.target.value as ThemeMode)}
          className="rounded-lg border bg-surface px-3 py-2 text-sm"
        >
          {(['system', 'light', 'dark'] as const).map((item) => (
            <option key={item} value={item}>
              {item[0]!.toUpperCase()}
              {item.slice(1)}
            </option>
          ))}
        </select>
      </section>
      <section className="mt-4 rounded-2xl border bg-card p-7">
        <h2 className="m-0 text-lg font-semibold">Export configuration</h2>
        <p className="mt-1 text-sm leading-6 text-surface-muted-foreground">
          Configure the fields, output names, formats, order, and visibility used by CSV and Excel
          report exports.
        </p>
        <button
          type="button"
          onClick={onConfigureExports}
          className="mt-5 flex w-full max-w-lg items-center gap-3 rounded-xl border bg-surface px-4 py-3 text-left hover:bg-surface-muted"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-container text-primary">
            <FileOutput size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Configure export fields</span>
            <span className="mt-0.5 block text-xs text-surface-muted-foreground">
              Opens the dedicated export configuration screen.
            </span>
          </span>
          <ChevronRight size={17} className="shrink-0 text-surface-muted-foreground" />
        </button>
      </section>
      <section className="mt-4 rounded-2xl border bg-card p-7">
        <h2 className="m-0 text-lg font-semibold">Untracked-time reminders</h2>
        <p className="mt-1 text-sm leading-6 text-surface-muted-foreground">
          Optionally remind you when planned time has passed without a task or break running.
          Reminders stay quiet outside planned blocks and never classify time automatically.
        </p>
        <label className="mt-5 flex items-start gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={reminderDraft.enabled}
            onChange={(event) =>
              setReminderDraft({ ...reminderDraft, enabled: event.target.checked })
            }
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            Remind me during an untracked planned gap
            <span className="mt-1 block text-xs font-normal text-surface-muted-foreground">
              Off by default. Dismissing a reminder leaves the gap unchanged.
            </span>
          </span>
        </label>
        <div className="mt-5 grid max-w-lg grid-cols-2 gap-4">
          <NumberField
            label="Remind after (minutes)"
            value={reminderDraft.gapMinutes}
            disabled={!reminderDraft.enabled}
            min={1}
            max={240}
            onChange={(gapMinutes) => setReminderDraft({ ...reminderDraft, gapMinutes })}
          />
          <NumberField
            label="Remind me later (minutes)"
            value={reminderDraft.snoozeMinutes}
            disabled={!reminderDraft.enabled}
            min={1}
            max={240}
            onChange={(snoozeMinutes) => setReminderDraft({ ...reminderDraft, snoozeMinutes })}
          />
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              void actions.updateWorkdayReminderSettings(reminderDraft).then(() => {
                setReminderSaved(true);
                window.setTimeout(() => setReminderSaved(false), 1800);
              })
            }
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            {reminderSaved ? 'Saved' : 'Save reminders'}
          </button>
          {reminderDraft.enabled && permission !== 'granted' ? (
            <button
              type="button"
              onClick={() => void requestNotificationPermission().then(setPermission)}
              className="rounded-lg border bg-surface px-3 py-2.5 text-sm font-medium hover:bg-surface-muted"
            >
              Enable system notifications
            </button>
          ) : null}
        </div>
      </section>
      <section className="mt-4 rounded-2xl border bg-card p-7">
        <h2 className="m-0 text-lg font-semibold">Menu bar timer</h2>
        <p className="mt-1 text-sm leading-6 text-surface-muted-foreground">
          Choose the time shown beside the task name by default. You can override this for the
          current timer from the Timer page.
        </p>
        <label className="mt-5 grid max-w-sm gap-2 text-sm font-medium">
          Default displayed time
          <select
            value={trayTimeModeDefault}
            onChange={(event) =>
              void actions.updateTrayTimeModeDefault(event.target.value as TrayTimeMode)
            }
            className="rounded-lg border bg-surface px-3 py-2.5 text-sm"
          >
            <option value="session">This session</option>
            <option value="task-total">Task total</option>
          </select>
        </label>
      </section>
      <section className="mt-4 rounded-2xl border bg-card p-7">
        <h2 className="m-0 text-lg font-semibold">Startup</h2>
        <p className="mt-1 text-sm leading-6 text-surface-muted-foreground">
          Make Tempo available in the menu bar as soon as you sign in to your Mac.
        </p>
        <label className="mt-5 flex items-start gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={launchAtLogin ?? false}
            disabled={launchAtLogin === null || savingLaunchAtLogin}
            onChange={(event) => void updateLaunchAtLogin(event.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span>
            Start Tempo when I log in
            <span className="mt-1 block text-xs font-normal leading-5 text-surface-muted-foreground">
              Login launches stay in the menu bar without opening the main window.
            </span>
          </span>
        </label>
        {savingLaunchAtLogin ? (
          <p className="mt-3 mb-0 text-xs text-surface-muted-foreground">Updating login item…</p>
        ) : null}
        {launchError ? (
          <p className="mt-4 rounded-lg bg-danger-container px-4 py-3 text-sm text-danger">
            Could not update launch at login: {launchError}
          </p>
        ) : null}
      </section>
      <section className="mt-4 rounded-2xl border bg-card p-7">
        <h2 className="m-0 text-lg font-semibold">Work confirmation</h2>
        <p className="mt-1 text-sm leading-6 text-surface-muted-foreground">
          Tempo checks that long-running timers are intentional. Ignored checks stop at the saved
          deadline after the grace period.
        </p>
        <label className="mt-5 flex items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
            className="size-4 accent-primary"
          />
          Require confirmation while a timer is running
        </label>
        <div className="mt-5 grid max-w-lg grid-cols-2 gap-4">
          <NumberField
            label="Check every (minutes)"
            value={draft.intervalMinutes}
            disabled={!draft.enabled}
            min={1}
            max={480}
            onChange={(intervalMinutes) => setDraft({ ...draft, intervalMinutes })}
          />
          <NumberField
            label="Grace period (minutes)"
            value={draft.graceMinutes}
            disabled={!draft.enabled}
            min={1}
            max={60}
            onChange={(graceMinutes) => setDraft({ ...draft, graceMinutes })}
          />
        </div>
        <label className="mt-5 flex items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={draft.notificationsEnabled}
            onChange={(event) => setDraft({ ...draft, notificationsEnabled: event.target.checked })}
            className="size-4 accent-primary"
          />
          Show a system notification with each check
        </label>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void requestNotificationPermission().then(setPermission)}
            className="rounded-lg border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-muted"
          >
            {permission === 'granted' ? 'Notifications enabled' : 'Enable notifications'}
          </button>
          <span className="text-xs text-surface-muted-foreground">Permission: {permission}</span>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          className="mt-6 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          {saved ? 'Saved' : 'Save work checks'}
        </button>
      </section>
      <section className="mt-4 rounded-2xl border bg-card p-7">
        <h2 className="m-0 text-lg font-semibold">Data</h2>
        <p className="mt-1 text-sm leading-6 text-surface-muted-foreground">
          Keep a portable copy of all tasks, entries, settings, and confirmation state. Development
          and installed builds use separate databases.
        </p>
        {dataMessage ? (
          <p className="mt-4 rounded-lg bg-success-container px-4 py-3 text-sm text-success">
            {dataMessage}
          </p>
        ) : null}
        {dataError ? (
          <p className="mt-4 rounded-lg bg-danger-container px-4 py-3 text-sm text-danger">
            Data operation failed: {dataError}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={dataOperation !== null}
            onClick={() => void backup()}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-45"
          >
            <DatabaseBackup size={17} />
            {dataOperation === 'backup' ? 'Backing up…' : 'Back up database'}
          </button>
          <button
            type="button"
            disabled={dataOperation !== null}
            onClick={() => void restore()}
            className="flex items-center gap-2 rounded-lg border bg-surface px-4 py-2.5 text-sm font-semibold hover:bg-surface-muted disabled:opacity-45"
          >
            <RotateCcw size={17} />
            {dataOperation === 'restore' ? 'Restoring…' : 'Restore database'}
          </button>
        </div>
        <p className="mt-4 mb-0 text-xs leading-5 text-surface-muted-foreground">
          Restore validates the selected database, preserves the current one as a safety backup, and
          restarts Tempo.
        </p>
      </section>
    </div>
  );
}

function NumberField({
  label,
  value,
  disabled,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        type="number"
        value={value}
        disabled={disabled}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 block w-full rounded-lg border bg-surface px-3 py-2 disabled:opacity-50"
      />
    </label>
  );
}
