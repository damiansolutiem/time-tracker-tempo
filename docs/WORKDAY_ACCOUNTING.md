# Workday accounting and privacy

Tempo's workday feature compares recorded task time with a user-defined weekly plan. The plan is a
guide, not a limit or a judgment: all time recorded against a task is working time, including
meetings and offline work.

## Calculation policy

- **Total tracked** is the union of task-entry intervals in the selected local day or range. A
  running entry ends at the captured current wall-clock instant.
- **Scheduled** is the configured work blocks for that weekday. Gaps between blocks are planned
  breaks and are outside the scheduled expectation.
- **Tracked in plan** is tracked time intersecting scheduled blocks. **Tracked beyond plan** is the
  remainder. They reconcile to total tracked time; neither is treated as less valid work.
- **Non-worked** is elapsed adjusted scheduled time without tracked task time. It reconciles to
  additional break + personal/away + distraction + unclassified time.
- **Unclassified** means a scheduled gap has no user explanation yet. Tempo does not infer its cause.
- **Distraction** is assigned only when the user explicitly chooses that classification. Tempo never
  labels a gap as distraction or procrastination automatically.
- **Ignored** is a schedule exception. It reduces the expected scheduled interval and is not tracked
  work or a non-worked category.

Intervals are clipped to local-day boundaries and merged before summing, so overlaps are not counted
twice. Persisted UTC timestamps are authoritative; live values are derived from those timestamps and
the current clock. Current-day schedule results are marked in progress. Completed days use the full
day's adjusted schedule.

Each date uses the latest weekly schedule revision effective on that local date. A date override can
replace that day's blocks with holiday/leave (no planned hours) or exceptional hours. Backdated
changes are explicit audited corrections. Exact finalized ranges use their frozen per-date schedule
map, so later Settings changes cannot alter them. None of these operations rewrites task entries or
classifications.

## Privacy policy

Workday coverage is local and private by default. Tempo stores the weekly schedule, reminder
preferences, task entries, and user-created gap classifications in the same local SQLite database as
the rest of the application. Database backup and restore include this data.

Tempo does not capture application names, websites, window titles, keystrokes, mouse activity,
screenshots, or passive activity telemetry. It does not send workday data to a cloud service and has
no analytics integration. System notifications contain only the reminder text needed to tell the
user that no timer or classification is running.

CSV, Excel, and JSON report exports are explicit user actions. Excel and JSON can include workday
summaries and classifications; configurable entry exports include schedule-context fields only when
the user adds those fields. Exported files are outside Tempo's database and should be handled
according to the user's own client and workplace privacy requirements.
