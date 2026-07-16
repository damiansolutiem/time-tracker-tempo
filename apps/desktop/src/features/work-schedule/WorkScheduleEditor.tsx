import {
  weekdays,
  type Weekday,
  type WeeklyWorkSchedule,
  type WorkBlock,
  type WorkScheduleOverride,
  type WorkScheduleOverrideEvent,
  type WorkScheduleRevision,
} from '@time-tracker/domain';
import { CalendarDays, Copy, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { localDateKey } from '../history/day';
import {
  copyMondayToWeekdays,
  getWorkScheduleValidationErrors,
  scheduledMinutesForDay,
  scheduledMinutesForWeek,
  timeToMinutes,
} from '../settings/workSchedule';
import { nextWorkScheduleTab, type WorkScheduleTab } from './workScheduleTabs';

type Props = {
  schedule: WeeklyWorkSchedule;
  revisions: WorkScheduleRevision[];
  overrides: WorkScheduleOverride[];
  overrideEvents: WorkScheduleOverrideEvent[];
  onSave: (
    schedule: WeeklyWorkSchedule,
    effectiveFrom: string,
    reason: string | null,
  ) => Promise<void>;
  onSetOverride: (date: string, name: string, blocks: WorkBlock[]) => Promise<void>;
  onRemoveOverride: (date: string) => Promise<void>;
};

const labels: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function cloneSchedule(schedule: WeeklyWorkSchedule): WeeklyWorkSchedule {
  return {
    enabled: schedule.enabled,
    days: Object.fromEntries(
      weekdays.map((day) => [day, schedule.days[day].map((block) => ({ ...block }))]),
    ) as WeeklyWorkSchedule['days'],
  };
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function newBlock(blocks: WorkBlock[]): WorkBlock {
  const last = [...blocks].sort((first, second) => first.end.localeCompare(second.end)).at(-1);
  const lastEnd = last ? timeToMinutes(last.end) : null;
  const startMinutes = lastEnd !== null && lastEnd <= 22 * 60 ? lastEnd : 9 * 60;
  const endMinutes = Math.min(startMinutes + 60, 23 * 60 + 59);
  const formatTime = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return { id: crypto.randomUUID(), start: formatTime(startMinutes), end: formatTime(endMinutes) };
}

export function WorkScheduleEditor({
  schedule,
  revisions,
  overrides,
  overrideEvents,
  onSave,
  onSetOverride,
  onRemoveOverride,
}: Props) {
  const [draft, setDraft] = useState(() => cloneSchedule(schedule));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState(localDateKey());
  const [revisionReason, setRevisionReason] = useState('');
  const [historicalRevisionAcknowledged, setHistoricalRevisionAcknowledged] = useState(false);
  const [overrideDate, setOverrideDate] = useState(localDateKey());
  const [overrideName, setOverrideName] = useState('');
  const [customOverride, setCustomOverride] = useState(false);
  const [overrideBlocks, setOverrideBlocks] = useState<WorkBlock[]>([
    { id: crypto.randomUUID(), start: '09:00', end: '17:00' },
  ]);
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [historicalOverrideAcknowledged, setHistoricalOverrideAcknowledged] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkScheduleTab>('weekly');
  const tabRefs = useRef<Record<WorkScheduleTab, HTMLButtonElement | null>>({
    weekly: null,
    exceptions: null,
  });

  useEffect(() => setDraft(cloneSchedule(schedule)), [schedule]);

  const validationErrors = useMemo(() => getWorkScheduleValidationErrors(draft), [draft]);
  const weeklyMinutes = scheduledMinutesForWeek(draft);

  function change(next: WeeklyWorkSchedule) {
    setDraft(next);
    setSaved(false);
    setSaveError(null);
  }

  function updateDay(day: Weekday, blocks: WorkBlock[]) {
    change({ ...draft, days: { ...draft.days, [day]: blocks } });
  }

  function toggleDay(day: Weekday, enabled: boolean) {
    updateDay(
      day,
      enabled
        ? [
            { id: crypto.randomUUID(), start: '09:00', end: '13:00' },
            { id: crypto.randomUUID(), start: '14:00', end: '18:00' },
          ]
        : [],
    );
  }

  function updateBlock(day: Weekday, id: string, patch: Partial<WorkBlock>) {
    updateDay(
      day,
      draft.days[day].map((block) => (block.id === id ? { ...block, ...patch } : block)),
    );
  }

  function handleCopyMondayToWeekdays() {
    change(copyMondayToWeekdays(draft, () => crypto.randomUUID()));
  }

  async function save() {
    if (validationErrors.length) return;
    setSaving(true);
    setSaveError(null);
    try {
      const historical = effectiveFrom < localDateKey();
      if (historical && (!revisionReason.trim() || !historicalRevisionAcknowledged)) {
        throw new Error('Backdated revisions require a reason and acknowledgement.');
      }
      await onSave(cloneSchedule(draft), effectiveFrom, revisionReason.trim() || null);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function saveOverride() {
    setOverrideBusy(true);
    setOverrideError(null);
    try {
      if (overrideDate < localDateKey() && !historicalOverrideAcknowledged) {
        throw new Error('Acknowledge that this backdated override changes historical reports.');
      }
      await onSetOverride(overrideDate, overrideName, customOverride ? overrideBlocks : []);
      setOverrideName('');
    } catch (error) {
      setOverrideError(error instanceof Error ? error.message : String(error));
    } finally {
      setOverrideBusy(false);
    }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = nextWorkScheduleTab(activeTab, event.key);
    if (!next) return;
    event.preventDefault();
    setActiveTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow)]">
      <div className="grid grid-cols-3 divide-x border-b bg-surface/35">
        <div className="px-5 py-4">
          <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-surface-muted-foreground">
            Coverage
          </p>
          <p className="mt-1 mb-0 text-sm font-semibold">
            {draft.enabled ? 'Enabled' : 'Disabled'}
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-surface-muted-foreground">
            Normal week
          </p>
          <p className="mt-1 mb-0 text-sm font-semibold">{formatMinutes(weeklyMinutes)} planned</p>
        </div>
        <div className="px-5 py-4">
          <p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-surface-muted-foreground">
            Date exceptions
          </p>
          <p className="mt-1 mb-0 text-sm font-semibold">{overrides.length} active</p>
        </div>
      </div>

      <div className="border-b px-7 pt-5">
        <div className="flex gap-6" role="tablist" aria-label="Work schedule sections">
          {(
            [
              ['weekly', 'Weekly plan'],
              ['exceptions', 'Date exceptions'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              id={`work-schedule-${id}-tab`}
              ref={(element) => {
                tabRefs.current[id] = element;
              }}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`work-schedule-${id}-panel`}
              tabIndex={activeTab === id ? 0 : -1}
              onClick={() => setActiveTab(id)}
              onKeyDown={handleTabKeyDown}
              className={`border-b-2 px-1 pb-3 text-sm font-semibold transition ${activeTab === id ? 'border-primary text-foreground' : 'border-transparent text-surface-muted-foreground hover:text-foreground'}`}
            >
              {label}
              {id === 'exceptions' && overrides.length ? (
                <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-[10px]">
                  {overrides.length}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'weekly' ? (
        <div
          id="work-schedule-weekly-panel"
          className="p-7"
          role="tabpanel"
          aria-labelledby="work-schedule-weekly-tab"
          tabIndex={0}
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-container text-primary">
              <CalendarDays size={19} />
            </span>
            <div>
              <h2 className="m-0 text-lg font-semibold">Recurring weekly plan</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-surface-muted-foreground">
                Set the hours you normally intend to work each weekday. Gaps between blocks are
                planned breaks and do not count as untracked planned time.
              </p>
            </div>
          </div>

          <label className="mt-6 flex items-start gap-3 rounded-xl border bg-surface/40 p-4 text-sm font-medium">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => change({ ...draft, enabled: event.target.checked })}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              Measure workday coverage
              <span className="mt-1 block text-xs font-normal leading-5 text-surface-muted-foreground">
                Tempo will compare scheduled time with tracked work. It will not automatically call
                gaps procrastination.
              </span>
            </span>
          </label>

          <div className="mt-6 flex items-center justify-between gap-4 border-b pb-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wider text-surface-muted-foreground">
              Weekly hours
            </p>
            <button
              type="button"
              onClick={handleCopyMondayToWeekdays}
              className="flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-xs font-semibold hover:bg-surface-muted"
            >
              <Copy size={14} /> Copy Monday to weekdays
            </button>
          </div>

          <div className="divide-y">
            {weekdays.map((day) => {
              const blocks = draft.days[day];
              const active = blocks.length > 0;
              return (
                <div key={day} className="grid grid-cols-[9rem_1fr] gap-5 py-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(event) => toggleDay(day, event.target.checked)}
                        className="size-4 accent-primary"
                      />
                      {labels[day]}
                    </label>
                    <p className="mt-1.5 ml-6 text-xs text-surface-muted-foreground">
                      {active ? formatMinutes(scheduledMinutesForDay(draft, day)) : 'Not scheduled'}
                    </p>
                  </div>
                  <div className="min-w-0 space-y-2">
                    {blocks.map((block, index) => (
                      <div key={block.id} className="flex items-center gap-2">
                        <label className="sr-only" htmlFor={`${block.id}-start`}>
                          {labels[day]} block {index + 1} start
                        </label>
                        <input
                          id={`${block.id}-start`}
                          type="time"
                          step="300"
                          value={block.start}
                          onChange={(event) =>
                            updateBlock(day, block.id, { start: event.target.value })
                          }
                          className="w-32 rounded-lg border bg-surface px-3 py-2 text-sm"
                        />
                        <span className="text-xs text-surface-muted-foreground">to</span>
                        <label className="sr-only" htmlFor={`${block.id}-end`}>
                          {labels[day]} block {index + 1} end
                        </label>
                        <input
                          id={`${block.id}-end`}
                          type="time"
                          step="300"
                          value={block.end}
                          onChange={(event) =>
                            updateBlock(day, block.id, { end: event.target.value })
                          }
                          className="w-32 rounded-lg border bg-surface px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateDay(
                              day,
                              blocks.filter(({ id }) => id !== block.id),
                            )
                          }
                          className="grid size-9 place-items-center rounded-lg text-surface-muted-foreground hover:bg-danger-container hover:text-danger"
                          aria-label={`Remove ${labels[day]} block ${index + 1}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {active ? (
                      <button
                        type="button"
                        onClick={() => updateDay(day, [...blocks, newBlock(blocks)])}
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary-container"
                      >
                        <Plus size={14} /> Add work block
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {validationErrors.length ? (
            <div className="mt-3 rounded-lg bg-danger-container px-4 py-3 text-sm text-danger">
              <p className="m-0 font-semibold">Review the schedule before saving:</p>
              <ul className="mt-1 mb-0 list-disc pl-5">
                {validationErrors.map((error) => (
                  <li key={error}>{error[0]!.toUpperCase() + error.slice(1)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {saveError ? (
            <p className="mt-3 rounded-lg bg-danger-container px-4 py-3 text-sm text-danger">
              Could not save schedule: {saveError}
            </p>
          ) : null}
          <div className="mt-7 border-t pt-6">
            <h3 className="m-0 text-sm font-semibold">Apply this weekly plan</h3>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-surface-muted-foreground">
              Choose when this version starts. Existing dates before it continue using their prior
              schedule revision.
            </p>
            <div className="mt-4 flex items-end gap-3">
              <label className="grid gap-1 text-xs font-medium text-surface-muted-foreground">
                Effective from
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(event) => {
                    setEffectiveFrom(event.target.value);
                    setHistoricalRevisionAcknowledged(false);
                  }}
                  className="rounded-lg border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>
              <button
                type="button"
                disabled={
                  saving ||
                  validationErrors.length > 0 ||
                  !effectiveFrom ||
                  (effectiveFrom < localDateKey() &&
                    (!revisionReason.trim() || !historicalRevisionAcknowledged))
                }
                onClick={() => void save()}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-45"
              >
                {saving ? 'Saving…' : saved ? 'Revision saved' : 'Save schedule revision'}
              </button>
            </div>
            {effectiveFrom < localDateKey() ? (
              <div className="mt-3 rounded-lg border border-warning/35 bg-warning-container/25 p-3">
                <p className="m-0 text-xs font-semibold text-warning">
                  This backdated revision changes non-finalized historical schedule reports.
                </p>
                <textarea
                  value={revisionReason}
                  onChange={(event) => setRevisionReason(event.target.value)}
                  placeholder="Reason for correcting the historical schedule"
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border bg-card px-3 py-2 text-sm"
                />
                <label className="mt-2 flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={historicalRevisionAcknowledged}
                    onChange={(event) => setHistoricalRevisionAcknowledged(event.target.checked)}
                  />
                  I understand that non-finalized reports and future exports can change.
                </label>
              </div>
            ) : null}
          </div>

          <details className="mt-6 rounded-xl border bg-surface/40 px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold">
              Schedule history ({revisions.length})
            </summary>
            <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
              {revisions.map((revision) => (
                <div
                  key={revision.id}
                  className="flex items-center gap-3 rounded-lg bg-card px-3 py-2 text-xs"
                >
                  <span>
                    Effective <strong>{revision.effectiveFrom}</strong> ·{' '}
                    {revision.schedule.enabled
                      ? `${formatMinutes(scheduledMinutesForWeek(revision.schedule))} / week`
                      : 'Coverage disabled'}
                    {revision.reason ? ` · ${revision.reason}` : ''}
                  </span>
                  <time className="ml-auto text-surface-muted-foreground">
                    saved {new Date(revision.createdAt).toLocaleString()}
                  </time>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(cloneSchedule(revision.schedule));
                      setEffectiveFrom(revision.effectiveFrom);
                      setRevisionReason('');
                      setHistoricalRevisionAcknowledged(false);
                      setSaved(false);
                    }}
                    className="rounded-md border px-2 py-1 font-semibold hover:bg-surface-muted"
                  >
                    Use as draft
                  </button>
                </div>
              ))}
            </div>
          </details>
        </div>
      ) : null}

      {activeTab === 'exceptions' ? (
        <div
          id="work-schedule-exceptions-panel"
          className="p-7"
          role="tabpanel"
          aria-labelledby="work-schedule-exceptions-tab"
          tabIndex={0}
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-container text-primary">
              <CalendarDays size={19} />
            </span>
            <div>
              <h2 className="m-0 text-lg font-semibold">Exception for a specific date</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-surface-muted-foreground">
                Use this for a holiday, leave day, or unusual hours. It replaces the weekly plan
                only for the selected date; removing it restores that date's weekly plan.
              </p>
            </div>
          </div>
          <section className="mt-6 rounded-xl border bg-surface/35 p-5">
            <h3 className="m-0 text-sm font-semibold">Create a date exception</h3>
            <p className="mt-1 text-xs leading-5 text-surface-muted-foreground">
              Leave custom hours off to create a day with no planned hours.
            </p>
            <div className="mt-4 grid grid-cols-[10rem_minmax(0,1fr)_auto] items-end gap-3">
              <label className="grid gap-1 text-xs font-medium text-surface-muted-foreground">
                Date
                <input
                  type="date"
                  value={overrideDate}
                  onChange={(event) => {
                    setOverrideDate(event.target.value);
                    setHistoricalOverrideAcknowledged(false);
                  }}
                  className="rounded-lg border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-surface-muted-foreground">
                Reason
                <input
                  value={overrideName}
                  onChange={(event) => setOverrideName(event.target.value)}
                  placeholder="Holiday, leave, exceptional hours…"
                  className="rounded-lg border bg-surface px-3 py-2 text-sm text-foreground"
                />
              </label>
              <label className="flex items-center gap-2 pb-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={customOverride}
                  onChange={(event) => setCustomOverride(event.target.checked)}
                />{' '}
                Custom hours
              </label>
            </div>
            {customOverride ? (
              <div className="mt-3 space-y-2 rounded-lg border bg-surface/40 p-3">
                {overrideBlocks.map((block, index) => (
                  <div key={block.id} className="flex items-center gap-2">
                    <input
                      type="time"
                      step="300"
                      value={block.start}
                      onChange={(event) =>
                        setOverrideBlocks(
                          overrideBlocks.map((item) =>
                            item.id === block.id ? { ...item, start: event.target.value } : item,
                          ),
                        )
                      }
                      className="w-32 rounded-lg border bg-card px-3 py-2 text-sm"
                      aria-label={`Override block ${index + 1} start`}
                    />
                    <span className="text-xs text-surface-muted-foreground">to</span>
                    <input
                      type="time"
                      step="300"
                      value={block.end}
                      onChange={(event) =>
                        setOverrideBlocks(
                          overrideBlocks.map((item) =>
                            item.id === block.id ? { ...item, end: event.target.value } : item,
                          ),
                        )
                      }
                      className="w-32 rounded-lg border bg-card px-3 py-2 text-sm"
                      aria-label={`Override block ${index + 1} end`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setOverrideBlocks(overrideBlocks.filter((item) => item.id !== block.id))
                      }
                      className="grid size-9 place-items-center rounded-lg hover:bg-danger-container"
                      aria-label={`Remove override block ${index + 1}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setOverrideBlocks([...overrideBlocks, newBlock(overrideBlocks)])}
                  className="flex items-center gap-1 text-xs font-semibold text-primary"
                >
                  <Plus size={13} /> Add block
                </button>
              </div>
            ) : null}
            {overrideError ? <p className="mt-3 text-xs text-danger">{overrideError}</p> : null}
            {overrideDate < localDateKey() ? (
              <label className="mt-3 flex items-start gap-2 rounded-lg border border-warning/35 bg-warning-container/25 p-3 text-xs text-warning">
                <input
                  type="checkbox"
                  checked={historicalOverrideAcknowledged}
                  onChange={(event) => setHistoricalOverrideAcknowledged(event.target.checked)}
                />
                I understand that this backdated override changes non-finalized historical reports
                and future exports.
              </label>
            ) : null}
            <button
              type="button"
              disabled={
                overrideBusy ||
                !overrideDate ||
                !overrideName.trim() ||
                (customOverride && !overrideBlocks.length) ||
                (overrideDate < localDateKey() && !historicalOverrideAcknowledged)
              }
              onClick={() => void saveOverride()}
              className="mt-3 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-45"
            >
              {overrideBusy ? 'Saving…' : 'Save date override'}
            </button>
          </section>
          <section className="mt-6">
            <h3 className="m-0 text-sm font-semibold">Active date exceptions</h3>
            <p className="mt-1 text-xs leading-5 text-surface-muted-foreground">
              These dates currently replace the recurring weekly plan.
            </p>
            <div className="mt-3 space-y-2">
              {overrides.map((override) => (
                <div
                  key={override.id}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-xs"
                >
                  <strong>{override.date}</strong>
                  <span className="min-w-0 flex-1 truncate">
                    {override.name} ·{' '}
                    {override.blocks.length
                      ? override.blocks.map((block) => `${block.start}–${block.end}`).join(', ')
                      : 'No planned hours'}
                  </span>
                  <button
                    type="button"
                    disabled={overrideBusy}
                    onClick={() => {
                      if (
                        override.date < localDateKey() &&
                        !window.confirm(
                          'Removing this historical override changes non-finalized reports and future exports. Continue?',
                        )
                      )
                        return;
                      setOverrideBusy(true);
                      setOverrideError(null);
                      void onRemoveOverride(override.date)
                        .catch((error) =>
                          setOverrideError(error instanceof Error ? error.message : String(error)),
                        )
                        .finally(() => setOverrideBusy(false));
                    }}
                    className="rounded-md px-2 py-1 font-semibold text-danger hover:bg-danger-container"
                  >
                    Remove
                  </button>
                </div>
              ))}
              {!overrides.length ? (
                <p className="text-xs text-surface-muted-foreground">No active date overrides.</p>
              ) : null}
            </div>
          </section>
          <details className="mt-4 rounded-lg border bg-surface/40 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold">
              Override audit history ({overrideEvents.length})
            </summary>
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
              {overrideEvents.map((event) => (
                <div key={event.id} className="rounded bg-card px-2 py-1.5 text-xs">
                  <strong>{event.date}</strong> ·{' '}
                  {event.action === 'remove'
                    ? 'Override removed'
                    : `${event.name} · ${event.blocks?.length ? event.blocks.map((block) => `${block.start}–${block.end}`).join(', ') : 'No planned hours'}`}{' '}
                  <span className="text-surface-muted-foreground">
                    · {new Date(event.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
