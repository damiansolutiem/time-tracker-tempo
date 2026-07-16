# Technical specification

## Architecture

The pnpm workspace contains a single Tauri desktop application and a small domain package. React and
status-bar adapters will call one TypeScript `TimerCoordinator`; neither owns independent timer
state. SQLite is the source of truth and React receives coordinator snapshots/events.

```text
React UI -----------\
                     > TimerCoordinator -> repositories -> SQLite
Tauri tray adapter -/          |
                                +-> app events / work-check scheduler
```

Business logic stays in TypeScript. Rust is limited to Tauri startup and official plugin
registration except for a narrow macOS status-title styling command. Tauri's string-only tray API
cannot color the task range or select tabular digits, so the adapter sets an attributed native title
with an orange pending task and a monospaced-digit elapsed range. It owns no timer logic.

The tray adapter subscribes to the same application store and `TimerCoordinator` used by React. It
does not own timer state. A one-second presentation tick derives the macOS title from the persisted
`started_at`; tray clicks and window focus reconcile SQLite. If hidden-webview throttling delays a
tick, the next title is computed from wall time rather than an incremented counter. Windows retains
the tooltip and native menu while omitting the unsupported status title.

## Stack and boundaries

- React 19.2, strict TypeScript, Vite, and actively configured React Compiler.
- Tailwind CSS 4 with first-party Vite integration.
- Tauri 2 with official SQL and notification plugins; tray APIs are enabled for Slice 2.
- SQLite migrations and repositories in `src/infrastructure/database`.
- Runtime-agnostic entities and policies in `packages/domain`.
- Vitest for TypeScript behavior; Rust tests only when custom Rust behavior exists.

No database package is extracted yet: database code has one consumer and depends on Tauri. A shared
repository package should be created only after a second runtime or test adapter proves the boundary.

## Persistence

`tasks`, `time_entries`, and key/value `settings` are introduced by migration 1. Migration 5 adds
flat `groups`, the task's current `group_id`, and a historical `group_id` snapshot on each time
entry. Starting a timer copies the task assignment into the entry; correcting an entry to another
task captures that selected task's current group. Task reassignment therefore affects only future
entries. Archived groups remain joinable for historical reports and exports.

Migration 6 adds nullable, case-insensitively unique `tasks.external_id`. `tasks.id` remains the
internal relationship key and every newly created task receives a UUID regardless of whether a
user-facing ID is supplied. Non-UUID IDs created by the earlier development implementation are
copied into `external_id` during migration so the visible value is preserved.

Migration 7 adds `work_notes`, with one-to-many ownership by `time_entries`, explicit creation and
modification timestamps, and validated JSON in `extra_data_json`. Existing single-entry notes are
migrated into list items. The typed application contract currently recognizes `timeSpentMs` while
preserving unknown JSON properties for future note-detail types.

Migration 8 seeds the disabled weekly schedule setting, migration 9 adds mutually exclusive workday
classifications and live-switch triggers, and migration 10 adds opt-in gap-reminder settings. Upgrade
tests execute the actual statements against an in-memory pre-feature version 7 database and assert
that historical task entries remain unchanged. Restored older databases run these migrations on the
next startup.

Migration 11 adds reusable `work_categories` and `work_tags`, task default category/tag IDs, and
denormalized category/tag snapshots on `time_entries`. A task stores its tag IDs as validated JSON;
starting or correcting an entry resolves those IDs and saves stable ID/name/color objects in one
entry write. Definition renames therefore affect task defaults but not historical report labels.

Migration 12 adds task/group label snapshots, immutable before/after entry-correction revisions, and
finalized report periods enforced by database triggers. The accounting policy and terminology are
recorded in `docs/adr/0001-auditable-historical-time-records.md`.

Migration 13 snapshots the weekly schedule on each finalization so exact finalized ranges retain
their original workday context after later schedule changes.

Migration 14 adds append-only `work_schedule_revisions`, append-only local-date override events, and
per-date schedule maps on finalized periods. Migration 15 records correction reasons on schedule
revisions. Resolution and precedence are specified in
`docs/adr/0002-effective-dated-work-schedules.md`.

A partial unique
index enforces at most one row with `ended_at IS NULL`; migration 2 adds a before-insert trigger that
ends the previous timer at the new timer's start timestamp in the same SQLite statement. Development
and production use separate database filenames. All timestamps use UTC ISO-8601. Each schema
migration is version-gated and recorded in `schema_migrations` after its statements succeed. Before
shipping data-bearing migrations, the runner will use an explicit transaction through a repository
adapter and gain migration rollback tests.

Elapsed time is `effectiveEnd - startedAt`, where `effectiveEnd` is the saved end, current wall time,
or the authoritative work-check deadline after expiry. No per-second writes occur.
The running card captures the task's persisted all-time total and advances it with the same
wall-clock delta used by the session display, keeping both values synchronized without per-second
database writes.
Creating, editing, or deleting work notes changes only `work_notes`; it never stops, restarts, or
changes the parent entry timestamps. Note-level `timeSpentMs` is metadata and is not included in
tracked-time totals.

History queries select every interval that intersects the chosen local calendar day. Presentation
clips each interval to local midnight before computing daily and task totals, so DST days may be 23
or 25 hours. Corrections validate positive, non-future timestamps and use a single `UPDATE ... NOT
EXISTS` statement to reject overlaps atomically. Adjacent entries are allowed; intersecting entries
are not.

## Timer and work-check invariants

- `start(taskId)` stops the existing entry and starts the new entry atomically.
- `stop({ endedAt })` validates the end against the start and persists it.
- `switchTo(taskId)` is one transaction, never two unrelated UI operations.
- Scheduler callbacks only trigger reconciliation; persisted deadlines decide outcomes.
- Closing the confirmation window changes no state.
- Presentation is keyed by entry ID and deadline: the window focuses and chimes once, does not
  re-focus during reconciliation, and a user-dismissed window stays closed for that deadline.
- Once grace expires, reconciliation saves `ended_at = check_due_at`.
- A Rust-generated runtime-session ID is persisted by the TypeScript settings repository. A changed
  ID with a surviving timer triggers recovery confirmation; webview reloads within the same process
  retain the ID and do not create false recovery prompts.
- A new timer receives its deadline from `confirmed_at + interval`; confirmation during grace saves
  a new `confirmed_at` and schedules the next deadline from that confirmation timestamp.
- The main webview owns `WorkCheckCoordinator`. The confirmation webview has no repository or timer
  coordinator; typed Tauri events carry display state and explicit user actions back to main.
- Stop and switch responses include the expected entry ID so a stale confirmation window cannot
  stop or replace a newer timer.

## Theme

`src/theme/tokens.css` is the only source of raw theme colors. It defines semantic OKLCH roles for
light and dark modes and exposes them through Tailwind utilities. Components use roles such as
`bg-card` and `text-surface-muted-foreground`. `ThemeProvider` persists the typed `ThemeMode` and
reacts to OS preference changes in system mode.

## Startup and window lifecycle

The OS-backed autostart registration launches Tempo with `--autostart`. The native main window is
hidden by default to prevent startup flashing; after application-store initialization, a manual
launch explicitly shows and focuses it, while an autostart launch leaves it hidden. Both modes
initialize the same tray and work-check controllers. Therefore a recovered running timer can still
present its dedicated confirmation window during a quiet login launch without revealing the main
window.

## Security and privacy

Tauri capabilities grant core window/webview creation, notification, and SQL operations to the main
window. The work-check window has a separate capability limited to event exchange and closing its
own window. The packaged application uses a local-only Content Security Policy: native IPC is the
only connection target, remote scripts and frames are blocked, and Tauri adds hashes/nonces for
bundled assets at compile time. A separate development policy permits only the local Vite server,
its hot-reload WebSocket, and the React Refresh bootstrap. No remote content, analytics, or cloud
APIs are loaded.

The user-facing workday calculation and privacy policy is documented in
[`WORKDAY_ACCOUNTING.md`](./WORKDAY_ACCOUNTING.md). Schedule coverage never observes other
applications or passive device activity; it uses only explicit schedule, task-entry, and
classification timestamps stored in SQLite.

## Reliability and testing

Unit tests cover domain policies, coordinator transitions, date splitting, historical group
attribution, report export parity, task CSV/XLSX round trips, and migration invariants.
Work-check tests use controlled clocks for scheduling, pending, confirmation, disabled checks,
grace expiry, and restart-after-deadline behavior. Manual Tauri acceptance tests cover sleep/wake,
hidden-window throttling, tray menus, notifications, and permission behavior. CI runs formatting,
linting, type checking, tests, and the frontend build on every pull request.
