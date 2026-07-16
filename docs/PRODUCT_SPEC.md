# Product specification

## Vision

Tempo is a calm, trustworthy desktop time tracker for people who want continuous visibility without
timesheet ceremony. It is local-first, fast to control from the macOS menu bar, and conservative
about claiming time that the user has not confirmed.

## Users and jobs

The primary user tracks several client, project, or personal tasks during a workday. They need to
start, stop, and switch in seconds; correct honest mistakes later; understand daily totals; and
trust that a forgotten timer will not silently report hours of idle time.

## Core experience

- **Timer:** current session time, live all-time task total, start/stop, recent tasks, and timestamped
  work-note lists saved directly on the running time entry without interrupting it.
- **Groups:** organize tasks by client, department, project, or another user-defined context.
- **Tasks:** create, edit, search, archive, start, import, and export tasks. A task can receive a
  human-friendly Task ID; archival preserves history.
- **History:** daily timeline with editable task/start/end timestamps and expandable work-note
  management.
- **Reports:** totals grouped by local day, group, and task, with a date range.
- **Settings:** work checks, notifications, appearance, and launch behavior.
- **macOS status bar:** optional Task ID prefix, truncated current task, and elapsed time plus start,
  stop, switch, open, and quit actions. Windows may later use icon/tooltip conventions.

## Work-confirmation policy

Checks are optional and default to every 60 minutes with a five-minute grace period. At the persisted
deadline Tempo opens a focused, always-on-top confirmation window and posts a system notification.
The user can confirm, stop, or switch. Dismissing the window is not confirmation. If grace expires,
the entry ends at the original deadline, excluding all later time. Confirming during grace includes
the grace time and schedules the next check from confirmation.

The confirmation window and chime appear once per deadline. After its initial presentation, the
window never takes focus again; closing it suppresses that window for the current check without
confirming the timer. While a response is pending, the macOS status-bar title carries an orange
task title; the elapsed digits use fixed-width glyphs so the status item remains visually stable.
Opening the main application while a response is pending shows the same decision as a compact,
sticky banner above the current screen.

Persisted timestamps are authoritative across sleep, throttling, crashes, and restarts. The system
reconciles on startup, foregrounding, tray-menu opening, task changes, wake events when available,
and a short periodic cadence.

If a running timer survives a full process restart, Tempo enters recovery confirmation immediately.
An already-pending or expired saved deadline remains authoritative; otherwise the recovery timestamp
becomes the deadline, preventing unconfirmed post-relaunch time from accumulating. Merely closing
the main window does not trigger recovery because Tempo continues running in the status bar.

## Product principles

1. **Truth over optimistic totals.** Unverified time is not silently counted.
2. **One action away.** Common timer controls remain available without opening the main window.
3. **Local by default.** No login, telemetry, or remote dependency is required.
4. **Correctable, auditable records.** History can be fixed without deleting task context.
5. **Quiet visibility.** The UI is compact, legible, keyboard accessible, and not attention-seeking.

## Initial decisions

- Task deletion is omitted once history exists; archive instead.
- Historical overlaps are rejected in v1, with actionable validation.
- Reports split entries at local midnight so each calendar day receives its actual duration.
- Groups are optional and flat. A time entry captures its task's group when tracking starts, so
  moving a task affects future time without rewriting historical group totals.
- User-facing Task IDs are optional, unique, editable, and separate from Tempo's
  internal UUIDs. CSV/XLSX import skips duplicate Task IDs instead of overwriting existing tasks,
  and creates missing flat groups by name.
- Work notes are separate records with created/modified timestamps and extensible extra data. An
  optional note-level time-spent value is descriptive metadata and never changes tracked duration.
- Weekly work schedules are immutable effective-dated revisions. Local-date overrides represent
  holidays, leave, or exceptional hours; finalized reports freeze their resolved per-date schedules.
- Per-task check overrides follow the global work-check feature, not the first timer slice.
- Direct signed/notarized distribution is the initial target; Mac App Store feasibility is reviewed
  after core behavior stabilizes. Windows follows macOS v1.

## Success criteria for v1

- Starting, stopping, switching, and restoring the active timer never creates two running entries.
- Status-bar elapsed time remains correct while the main window is hidden.
- Ignored work checks never count beyond their persisted deadline.
- Corrections and report totals remain consistent across timezone/DST boundaries.
- A user can back up and export all meaningful data without an account.
