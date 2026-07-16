import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import { Check, CircleStop, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../timer/time';
import {
  WORK_CHECK_READY,
  WORK_CHECK_STATE,
  type WorkCheckAction,
  type WorkCheckWindowState,
} from './events';

export function WorkCheckWindow() {
  const [state, setState] = useState<WorkCheckWindowState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [switching, setSwitching] = useState(false);
  const [taskId, setTaskId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const chimedFor = useRef<string | null>(null);

  useEffect(() => {
    document.body.classList.add('work-check-window');
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<WorkCheckWindowState>(WORK_CHECK_STATE, ({ payload }) => {
      setState(payload);
      setTaskId(payload.tasks[0]?.id ?? '');
      const key = `${payload.entryId}:${payload.deadline}`;
      if (chimedFor.current !== key) {
        chimedFor.current = key;
        void playWorkCheckChime().catch(() => undefined);
      }
    }).then((cleanup) => {
      if (cancelled) {
        cleanup();
        return;
      }
      unlisten = cleanup;
      void emitTo('main', WORK_CHECK_READY);
    });
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelled = true;
      unlisten?.();
      window.clearInterval(tick);
      document.body.classList.remove('work-check-window');
    };
  }, []);

  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center text-sm">Loading work check…</main>
    );
  }

  async function act(action: WorkCheckAction) {
    setSubmitting(true);
    setActionError(null);
    try {
      await invoke('submit_work_check_action', { action });
    } catch (error) {
      setSubmitting(false);
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  const graceMs = new Date(state.graceEndsAt).getTime() - now;
  const sessionMs = Math.max(0, now - new Date(state.startedAt).getTime());
  return (
    <main className="min-h-screen bg-background p-7 text-foreground">
      <div className="mx-auto max-w-sm">
        <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-warning-container text-warning">
          <RefreshCw size={23} />
        </div>
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.16em] text-warning">
          {state.reason === 'recovery' ? 'Timer recovered after restart' : 'Work confirmation'}
        </p>
        <h1 className="mt-2 mb-0 text-2xl font-semibold tracking-tight">Still working?</h1>
        <p className="mt-2 text-sm leading-6 text-surface-muted-foreground">
          {state.reason === 'recovery' ? 'Tempo restarted while ' : 'Confirm '}
          <span className="font-semibold text-foreground">{state.taskTitle}</span>
          {state.reason === 'recovery'
            ? ' was still running. Confirm that you want to continue.'
            : ' before the grace period ends.'}
        </p>
        <div className="mt-5 rounded-2xl border bg-card p-5 shadow-[var(--shadow)]">
          <p className="m-0 text-xs font-semibold uppercase tracking-wider text-surface-muted-foreground">
            Current session
          </p>
          <p className="mt-1 mb-0 font-mono text-3xl font-semibold tabular-nums">
            {formatDuration(sessionMs)}
          </p>
          <p
            className="mt-3 mb-0 text-sm text-surface-muted-foreground"
            aria-label={graceMs > 0 ? 'Time left to respond' : undefined}
          >
            {graceMs > 0
              ? `${formatDuration(graceMs)} left to respond`
              : 'Grace period expired — reconciling…'}
          </p>
        </div>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void act({ type: 'confirm', entryId: state.entryId })}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Check size={18} /> Still working
        </button>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void act({ type: 'stop', entryId: state.entryId })}
            className="flex items-center justify-center gap-2 rounded-xl border bg-card px-3 py-3 text-sm font-semibold hover:bg-surface-muted disabled:opacity-60"
          >
            <CircleStop size={17} /> Stop task
          </button>
          <button
            type="button"
            disabled={submitting || !state.tasks.length}
            onClick={() => setSwitching(!switching)}
            className="rounded-xl border bg-card px-3 py-3 text-sm font-semibold hover:bg-surface-muted disabled:opacity-50"
          >
            Switch task
          </button>
        </div>
        {switching ? (
          <div className="mt-3 flex gap-2 rounded-xl border bg-card p-3">
            <label htmlFor="work-check-switch-task" className="sr-only">
              Task to switch to
            </label>
            <select
              id="work-check-switch-task"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border bg-surface px-3 py-2 text-sm"
            >
              {state.tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.groupName ? `${task.groupName} · ` : ''}
                  {task.title}
                  {task.externalId ? ` [${task.externalId}]` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={submitting || !taskId}
              onClick={() => void act({ type: 'switch', entryId: state.entryId, taskId })}
              className="rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              Switch
            </button>
          </div>
        ) : null}
        {actionError ? (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-danger-container px-3 py-2 text-xs text-danger"
          >
            Could not apply the action: {actionError}
          </p>
        ) : null}
        <p className="mt-5 text-center text-xs leading-5 text-surface-muted-foreground">
          Closing this window does not confirm the timer.
        </p>
      </div>
    </main>
  );
}

async function playWorkCheckChime() {
  const AudioContextClass = window.AudioContext;
  const context = new AudioContextClass();
  await context.resume();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.55);
  gain.connect(context.destination);
  for (const [frequency, delay] of [
    [659.25, 0],
    [783.99, 0.16],
  ] as const) {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(context.currentTime + delay);
    oscillator.stop(context.currentTime + delay + 0.35);
  }
  window.setTimeout(() => void context.close(), 800);
}
