# Implementation plan

Each slice ends in behavior that can be exercised end to end. Later slices may refine foundations,
but none should leave two competing sources of timer state.

## Slice 0 — Foundation (complete)

Deliver the independent workspace, React/Tauri shell, active compiler integration, semantic theme,
SQLite schema/plugin permissions, notification foundation, navigation preview, CI, and docs.

Acceptance: install is reproducible; format/lint/typecheck/tests/frontend build pass; the theme can
switch among system/light/dark; a native build is attempted when Rust is available.

## Slice 1 — Tasks and manual timer (complete)

Implemented repositories, versioned migrations, `TimerCoordinator`, task create/edit/archive, and
the real timer flow. The shell now reads SQLite through one application store, restores a running
entry after relaunch, and derives elapsed display from timestamps. SQLite atomically stops the
previous timer through an insert trigger while the unique partial index remains the final invariant.

Acceptance: create a task, start it, relaunch, observe correct elapsed time, stop it, and see the
entry in recent activity. Database and coordinator tests prove the one-running invariant and
atomic switching.

## Slice 2 — macOS status bar (complete)

Implemented the TypeScript Tauri tray adapter with a template clock icon, truncated task title,
elapsed title on macOS, recent-task actions, stop/switch/open/quit, and serialized menu rebuilding
from coordinator state. Tray clicks, window focus, and opening the main window reconcile persisted
state. Closing the main window hides it without terminating the status item.

Acceptance: all timer actions work with the main window hidden; UI and tray stay consistent; elapsed
time recovers correctly after JavaScript throttling. Document Windows icon/tooltip fallback.

## Slice 3 — History and corrections (complete)

Implemented the local-day timeline and entry editor for task, start/end timestamps, and notes.
Corrections reject invalid, future, and overlapping intervals through UI validation and a guarded
SQLite update. Daily and per-task totals clip entries at local midnight, including entries that span
days; tests cover both DST boundary lengths.

Acceptance: edit an entry and immediately observe consistent history and daily/task totals; invalid
or overlapping edits show specific errors and make no partial writes.

## Slice 4 — Work confirmation (complete)

Added global interval/grace settings, persisted reconciliation, notification permission UX, and a
small always-on-top confirmation window with its own capability. Confirm, stop, switch, and exact
deadline-expiry transitions reconcile on startup, timer actions, focus/visibility changes, tray
access, and a periodic wall-clock cadence.

Acceptance: ignored checks stop exactly at deadline across normal use, sleep, application restart,
and hidden-window throttling. Dismissing the window confirms nothing. Automated clock-based tests
cover every state transition.

## Slice 5 — Reports and operations (data portability complete)

Date-range reports now provide inclusive local-calendar ranges, common presets, live running-entry
totals, and breakdowns by day and task. Entries spanning midnight are split between their actual
local days, including 23/25-hour DST boundaries.

CSV/Excel/JSON exports use the same day-splitting policy, so exact exported durations match Reports.
Native database backup checkpoints and closes SQLite before copying. Restore validates the selected
Tempo schema, preserves a safety copy, replaces the database, and restarts the application. Both
serialization parity and database replacement have automated tests.

Launch at login is now an optional OS-backed setting. Login launches carry a dedicated startup flag,
initialize the status item with the main window hidden, and still present recovery confirmation when
an unfinished timer exists. Normal manual launches continue to show the main window.

The full-application accessibility and keyboard review is complete. The application has a skip
target and page-focus management, dialogs consistently trap and restore focus, schedule tabs support
the standard arrow/Home/End keyboard model, form controls and asynchronous feedback expose explicit
accessible names and status semantics, and reduced-motion preferences are respected. Focus and tab
behavior have deterministic tests.

Remaining: final icon review, packaging, code signing, notarization, and release automation.
Production and development CSP policies are complete.

Acceptance: exported totals match reports; backup restoration is documented and tested; a signed
macOS build passes install/update smoke testing. Review Mac App Store scope and begin the Windows
tray adapter as a later milestone.

## Slice 6 — Flexible task groups (complete)

Added optional, flat groups that can represent clients, departments, projects, or cost centers.
Tasks can be assigned, filtered, searched, and displayed by group. Groups can be edited and archived
without deleting tasks or historical data. History can filter by the group captured on each entry;
reports aggregate by group and then task; CSV/JSON rows include both stable group and task IDs.

Time entries snapshot `group_id` when tracking starts or an entry is corrected to another task.
Moving a task therefore changes future tracking only and cannot silently rewrite old client totals.

Acceptance: moving a task between two groups preserves earlier entries under the original group,
while new entries appear under the new group in History, Reports, CSV, and JSON.

## Slice 7 — Task interoperability and live notes (complete)

Added notes directly to the running timer card. Saving updates the current time entry in place, so
the original start time and continuously recorded duration remain intact. New tasks can use an
optional, editable human-friendly Task ID, stored separately from the immutable internal UUID used
by history.

Tasks can be imported from CSV, XLSX, or tabular cells pasted from Excel. Imports accept group,
client, or department headers, create missing groups by name, preserve active/archived status, and
report skipped rows without overwriting duplicate IDs. Active and archived tasks export to safe CSV
or formatted XLSX. Reports add one-click Today and Yesterday ranges.

Acceptance: task files round-trip through CSV/XLSX, duplicate IDs never overwrite data, pasted
spreadsheet rows create valid tasks/groups, and saving a running note does not split the timer.

## Slice 8 — Structured work-note lists (complete)

Replaced the single entry-note editor with one-to-many work notes on running and historical time
entries. Notes can be created, edited, and deleted, and retain added/modified timestamps. Each note
has extensible JSON extra data; optional note-level time spent is the first typed detail and remains
descriptive metadata rather than changing tracked totals.

Existing single notes migrate into the new table. CSV and JSON retain structured notes, while Excel
reports include a dedicated filterable Work notes worksheet.

Acceptance: multiple notes survive timer stop/restart, edits update only their modification time,
deletion leaves tracked time untouched, legacy notes migrate once, and arbitrary future extra-data
keys survive a time-spent edit and export.

## Slice 9 — Categories and tags (complete)

Add one optional category and multiple tags as reusable task defaults. Timer start and History
correction snapshot category/tag IDs, names, and colors onto each time entry; later task assignment
or label renames cannot rewrite historical attribution.

Categories are mutually exclusive, so report category totals reconcile exactly with total tracked
time. Tags are many-to-many and explicitly non-additive. Reports can filter by both dimensions;
filtered task-label views omit schedule coverage rather than incorrectly treating excluded task
time as non-worked. CSV, Excel, and JSON include entry snapshots and stable IDs, with dedicated
Excel category/tag total sheets.

Acceptance: task defaults copy to new entries, historical corrections can change entry snapshots,
category totals equal total tracked time, overlapping tag totals are clearly identified, filtered
exports match filtered reports, and label renames leave prior entry names unchanged.

## Slice 10 — Audited corrections and finalized reports (complete)

Historical entry corrections require a reason and explicit acknowledgement. Each successful edit
atomically appends an immutable before/after revision visible from History; failed edits append
nothing. Task and group labels are snapshotted onto entries so later renames cannot alter old output.

Reports can finalize an exact unfiltered date range. SQLite triggers protect overlapping entries,
work notes, and gap classifications until a reasoned unlock, while finalization/unlock events remain
available as an audit record. JSON, Excel, and default CSV identify their generation time.

Acceptance: corrections create exactly one immutable revision, finalized periods reject every
covered mutation without partial writes, unlocks require reasons, regenerated reports retain
historical task/group labels and the finalized schedule, and report/export duration parity remains
unchanged.

## Slice 11 — Effective-dated schedule history (complete)

Weekly schedule saves are immutable revisions with inclusive local effective dates. Reports, exports,
History, Timer, and untracked-time reminders resolve the correct revision per date. Append-only date
overrides support holidays, leave, and exceptional hours; removing one records a tombstone.

Backdated changes require explicit historical-change acknowledgement and reasons. Finalized periods
freeze the resolved schedule for every included date, including overrides.

Acceptance: future revisions never change prior dates, same-date corrections resolve deterministically,
date overrides affect only their selected local day, finalized reports remain frozen, DST boundaries
retain local-day semantics, and report/export schedule totals remain identical.
