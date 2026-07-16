# Data portability

Tempo keeps all meaningful application data in one local SQLite database. Reports can also be
exported as CSV, Excel (`.xlsx`), or JSON without exposing or changing the database.

## Import or export tasks

Open **Tasks** to export all active and archived tasks as CSV or Excel (`.xlsx`). Both formats use
the columns `task_id`, `internal_id`, `title`, `group`, `category`, `tags`, `description`, `color`,
and `status`.
`task_id` is the optional user-defined identifier; `internal_id` is Tempo's immutable UUID and is
included for traceability. CSV values are protected from spreadsheet formula execution.

Choose **Import** to select a `.csv`/`.xlsx` file, or paste a table copied from Excel. A header row
and `title` column are required. `task_id` is optional; `id`, `code`, and `external_id` are accepted
aliases. Tempo always creates its own internal UUID and ignores imported `internal_id` values. The
group column may also be named client or department. Missing groups, categories, and tags are
created automatically; multiple tags use `|` or `;` as separators. Accepted colors are green, blue,
amber, and red. Duplicate Task IDs and invalid rows are skipped and reported; existing tasks are
never overwritten.

## Export a report

1. Open **Reports**.
2. Select and apply an inclusive date range.
3. Choose **Export CSV**, **Export Excel**, or **Export JSON**.
4. Select a destination in the native save dialog.

Entries crossing local midnight are emitted as one segment per day. Each row includes `group`,
`group_id`, `task`, `task_id` (user-facing), and `internal_task_id` (Tempo UUID). Group values come
from the historical assignment captured on the
time entry, not from the task's current group. The sum of exported `duration_ms` values therefore
matches the total shown in Reports, including daylight-saving boundaries and the current portion of
a running entry. CSV text is UTF-8 and protects group names, task titles, and notes that spreadsheet
applications could otherwise interpret as formulas. JSON retains exact millisecond durations and
export metadata.

Excel report exports contain a formatted **Summary** worksheet with range and group/task totals,
plus filterable **Daily summary**, **Schedule context**, **Category totals**, **Tag totals**, **Time
entries**, **Work notes**, and **Classifications** worksheets. CSV embeds structured work notes as JSON on each
day-split entry segment; JSON exports retain the note objects, timestamps, complete extensible extra
data, workday summaries, and raw gap classifications. Each historical date uses its effective
weekly schedule revision and any date override; schedule changes do not rewrite entries or
classifications.
JSON exports include the resolved per-date schedule map, while Excel records it in **Schedule
context**, so schedule-derived totals remain explainable independently of later revisions.

Category and tag values in report exports are historical entry snapshots, not the task's current
defaults. Category totals are additive and equal tracked time. Tag totals are non-additive because
one entry can carry multiple tags. Category/tag filters apply to exported task time; schedule
context is omitted for filtered exports so excluded task time is never misreported as non-worked.

Exports include their generation timestamp (`exportedAt` in JSON, **Generated at** in Excel, and
`exported_at` in the default configurable CSV columns). Existing files never change. If an unlocked
historical entry is corrected, a later export of the same dates can differ and its generation time
identifies which version was produced.

## Finalize a reporting period

Open **Reports**, apply an unfiltered date range, and choose **Finalize period**. Tempo requires all
overlapping timers/classifications to be stopped, then protects entries, work notes, and gap
classifications in that range. This is useful after invoicing or submitting a timesheet. Unlocking
requires a reason, and both events remain in the period audit. Corrections made before finalization
remain visible from each edited History entry. Tempo also preserves the weekly schedule used at
finalization, so later schedule-setting changes do not alter that exact finalized report range.

## Back up the database

1. Open **Settings → Data**.
2. Choose **Back up database**.
3. Save the `.db` file somewhere outside Tempo's application-data folder.

Tempo checkpoints and briefly closes its SQLite connection before making the copy. The timer and
status-bar process remain active, and database access resumes after the copy completes.

## Restore a database

1. Open **Settings → Data**.
2. Choose **Restore database** and select a `.db`, `.sqlite`, or `.sqlite3` file.
3. Confirm the destructive replacement dialog.

Tempo verifies that the selected SQLite file contains its required tables before changing any
data. It then preserves the active database as `tempo-before-restore.db` (or
`tempo-dev-before-restore.db` in development), installs the selected database, removes stale SQLite
sidecar files, and restarts. Migrations run normally after restart, so an older valid Tempo backup
can be upgraded.

Development and installed builds remain isolated: development uses `tempo-dev.db`, while an
installed production build uses `tempo.db`.
