# Implementation plan: non-working time and workday coverage

Status: complete

This plan adds scheduled workdays, breaks, and gap classification to Tempo. It is intentionally
separate from task time tracking: existing task entries remain the authoritative record of work,
while the schedule supplies the expected time window and classifications explain gaps inside it.

## Progress legend

- [ ] Not started
- [~] In progress
- [x] Complete

Update the slice heading and its checklist together. A slice is complete only when its acceptance
criteria and relevant automated checks pass.

## Product language and accounting rules

Tempo must not automatically label every untracked minute as procrastination. Meetings and offline
work are working time and should be recorded against a task like any other work. A timer gap remains
non-worked time until task time is recorded for it.

Use these terms in the application:

- **Scheduled work**: elapsed time inside configured work blocks.
- **Tracked work**: the union of all task-entry time overlapping scheduled work blocks. Meetings,
  calls, research, and offline work are working time when recorded against a task.
- **Planned break**: a gap deliberately configured between work blocks. It is outside scheduled
  work and does not reduce coverage.
- **Non-worked time**: elapsed scheduled work without overlapping task time.
- **Break**: an additional, user-classified break inside scheduled work.
- **Personal / away**: non-working time that the user does not want counted as distraction.
- **Distraction**: time the user explicitly classifies as distracting. This is the only metric that
  the UI may describe as procrastination.
- **Ignored**: a schedule exception that is removed from the expected time for that day.
- **Overtime**: tracked work outside scheduled work blocks.

The schedule is a planning guide, not a hard boundary. All tracked task time is equally valid work.
During-plan and beyond-plan portions may be shown as secondary context, but total tracked time is the
primary work total for freelancers and employees alike.

For a day at a specific instant:

```text
elapsed scheduled time
  = configured work blocks clipped to [start of day, now]

non-worked time
  = elapsed scheduled time
  - union(tracked task time within schedule)

coverage
  = tracked work / elapsed scheduled time
```

Classifications explain portions of non-worked time; they do not convert those portions into tracked
work. The `ignored` category is the exception: its interval is removed from scheduled expectation
for that day. Task categories/tags are a separate dimension for classifying working time and should
eventually support tag-based reports without changing workday coverage.

Intervals must be unioned before calculating totals so overlapping records are never double-counted.
The current day uses the current wall-clock instant; completed days use the end of the configured
schedule. All persisted timestamps remain UTC ISO-8601, with schedule boundaries interpreted in the
user's local timezone.

## Scope decisions

- [x] Allow different schedules for each weekday.
- [x] Allow multiple work blocks per day rather than storing only a daily-hours number.
- [x] Provide “copy to weekdays” so a standard Monday–Friday schedule is quick to configure.
- [x] Derive planned breaks from the gaps between work blocks.
- [x] Keep task entries and non-working classifications separate.
- [x] Make classifications editable and deletable.
- [x] Treat the feature as local and private by default.
- [x] Do not capture application names, websites, window titles, keyboard activity, or screenshots in
      the initial implementation.
- [x] Do not add an opaque productivity score.

## Slice 1 — Schedule model and settings

Status: complete

Add a typed weekly work schedule and persist it in SQLite settings. A schedule contains an enabled
flag and seven weekday records, each containing zero or more non-overlapping local-time work blocks.

- [x] Add domain types for `WeeklyWorkSchedule`, `DaySchedule`, and `WorkBlock`.
- [x] Define a safe default: feature disabled, Monday–Friday, 09:00–13:00 and 14:00–18:00.
- [x] Add normalization and validation for malformed JSON, invalid times, zero-length blocks, and
      overlapping blocks.
- [x] Add repository read/write support under a versioned settings key.
- [x] Load the schedule into the application store and expose one update action.
- [x] Add a Settings section with enable/disable, weekday selection, block add/remove/edit, and
      “copy Monday to weekdays”.
- [x] Show the planned daily and weekly scheduled duration before saving.
- [x] Include the setting automatically in existing database backup/restore behavior.
- [x] Add unit tests for defaults, serialization, normalization, overlap rejection, overnight block
      rejection, and weekday copying.

Acceptance: a user can configure split working hours independently by weekday, restart Tempo, and
see the same valid schedule. Invalid or overlapping blocks cannot be saved.

## Slice 2 — Workday coverage calculation

Status: complete

Implement pure interval utilities before adding UI. Calculations must work without creating
per-second database rows.

- [x] Build local schedule blocks for a selected date, including DST boundary days.
- [x] Clip task entries to schedule blocks and local-day boundaries.
- [x] Merge overlapping intervals before summing them.
- [x] Produce a `DailyWorkdaySummary` containing scheduled, elapsed scheduled, tracked in schedule,
      overtime, planned break, non-worked, remaining, and coverage percentages.
- [x] Define behavior when the feature is disabled, today is not scheduled, or the schedule has not
      started yet.
- [x] Clamp every derived value to valid bounds and prevent negative non-worked time.
- [x] Add clock-driven tests for before-work, within-work, planned break, after-work, running timers,
      entries spanning midnight, overlaps, and 23/25-hour DST days.

Acceptance: given the same schedule, entries, timezone, and clock, the calculator always produces
deterministic totals with no double counting.

## Slice 3 — Timer-screen workday summary

Status: complete

Make the current state visible without overwhelming the existing running-task card.

- [x] Add a compact “Today’s workday” panel to the Timer screen.
- [x] Show scheduled, tracked, planned-break, non-worked, and remaining time.
- [x] Update current-day values synchronously with the existing one-second timer tick.
- [x] Add a segmented coverage treatment for worked, non-worked, and future scheduled time, with
      planned breaks called out separately as excluded time.
- [x] When no task is running during scheduled work, show how long the current gap has been open.
- [x] Provide a direct action to choose a task. Starting a break and classifying the current gap are
      delivered with the persisted classification model in Slice 4.
- [x] Use neutral language and reserve orange for actionable non-worked time during scheduled work.
- [x] Ensure the panel has useful empty states when scheduling is disabled or today is not a workday.
- [x] Review narrow-window layout, keyboard navigation, screen-reader labels, and contrast.

Acceptance: during a configured workday, Timer accurately updates tracked and non-worked time
without requiring a refresh and provides a clear next action when no task is running.

## Slice 4 — Gap classifications and break timer

Status: complete

Persist user explanations for scheduled gaps. Use a dedicated interval table rather than synthetic
tasks so reports and exports cannot confuse non-working time with client work.

Proposed table:

```sql
CREATE TABLE workday_classifications (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (
    category IN ('break', 'personal_away', 'distraction', 'ignored')
  ),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
```

- [x] Add a migration, indexes by start time/category, repository, coordinator, and domain types.
- [x] Enforce at most one running classification and prevent simultaneous task and classification
      timers.
- [x] Starting a task stops a running break/classification at the same timestamp.
- [x] Starting a break stops a running task only after explicit confirmation.
- [x] Add current-gap classification with editable start/end times.
- [x] Add direct Timer-screen actions to start a break or classify the current gap.
- [x] Add a simple running-break state to the Timer screen and menu-bar menu.
- [x] Let users edit/delete classifications from History without modifying task entries.
- [x] Validate future, inverted, and overlapping classification intervals.
- [x] Decide and document how overlapping task/classification intervals are surfaced for correction.
- [x] Add repository/coordinator tests for switching, persistence, restart recovery, and corrections.

Overlap policy: creation and correction are rejected when a classification intersects task time or
another classification. The editor keeps the user's values and displays the conflict so they can
adjust the interval; it never silently trims historical records. Database triggers close the other
active timer at the same timestamp for live switches. On startup, if externally modified data has
left both timer kinds running, Tempo keeps the later activity and closes the earlier one at that
activity's start time.

Acceptance: the user can record a break or classify an existing gap, restart Tempo safely, edit the
classification later, and immediately see recalculated daily totals.

## Slice 5 — Daily review and reminders

Status: complete

Help users resolve ambiguous gaps without silently guessing.

- [x] Add an end-of-day review listing unclassified scheduled intervals.
- [x] Allow classifying, splitting, merging, or ignoring each gap.
- [x] Add an opt-in reminder when no timer/classification is running for a configurable duration
      during scheduled work.
- [x] Suppress reminders before work, during planned breaks, after work, on unscheduled days, and
      while a work-confirmation dialog is pending.
- [x] A dismissed reminder must not classify or delete time.
- [x] Add “remind me later” without repeatedly taking application focus.
- [x] Persist reminder preferences and last-notified state needed to prevent notification loops.
- [x] Add deterministic tests for reminder eligibility and schedule boundaries.

Review behavior: unresolved intervals are maximal adjacent gaps after subtracting the union of task
time and classifications from elapsed planned blocks. Editing the proposed interval splits a gap;
the leftover portions remain unresolved and are shown on refresh. Adjacent unresolved time is merged
by interval normalization. Intervals separated by task time or an existing classification are not
merged because doing so would create an accounting overlap.

Reminder behavior: reminders are disabled by default. The first notification records the current
gap start, dismissing retains that marker to prevent a loop, and “remind me later” persists one next
eligible timestamp. Neither action edits time. The reminder is an in-app banner plus an optional
system notification and never opens or focuses a window.

Acceptance: the user can review every unresolved workday gap, and reminders only appear when the
configured schedule makes them relevant.

## Slice 6 — Reports and exports

Status: complete

Extend reporting without changing existing task totals.

- [x] Add scheduled, adjusted scheduled, tracked-in-schedule, overtime, planned break, additional
      break, personal/away, distraction, ignored, non-worked, and coverage metrics by day.
- [x] Add date-range totals and trends for average unclassified/distraction time per scheduled day.
- [x] Distinguish incomplete current-day values from completed-day totals.
- [x] Add filters or breakdowns by classification category where useful.
- [x] Add the new metrics to JSON and Excel summaries.
- [x] Add appropriate selectable fields to configurable CSV/Excel export columns.
- [x] Preserve the existing Time entries sheet as task-entry data; classifications should use a
      separate Excel sheet and canonical JSON collection.
- [x] Add parity tests proving report and exported totals use the same calculator.

Reporting behavior: total tracked task time remains the primary report and continues to drive task
and group totals. Schedule context is secondary and uses one shared daily calculator for the UI,
JSON, Excel, and optional repeated day-context fields on configurable time-entry rows. “Tracked
beyond plan” is contextual work, not invalid or non-working time. Non-worked time reconciles as
additional break + personal/away + distraction + unclassified time. Ignored time instead reduces
the adjusted schedule expectation.

Current-day values are marked in progress and use elapsed adjusted plan time as the coverage
denominator. Completed days use the full adjusted plan. Excel preserves the configurable Time
entries sheet and adds Daily summary and Classifications sheets; canonical JSON includes both daily
summaries and raw classification records. Historical dates visibly use the currently configured
schedule until effective-dated schedule revisions are implemented in Slice 7.

Acceptance: report totals equal exported totals for the same schedule, range, classifications, and
clock, while task and client totals remain unchanged.

## Slice 7 — Hardening and release readiness

Status: complete

- [x] Test application restart with a running task, running break, and unresolved historical gap.
- [x] Test schedule changes without rewriting historical task or classification records.
- [x] Decide whether reports should use the current schedule for historical dates or snapshot
      schedule revisions; implement schedule history if accurate past expectations are required.
- [x] Add migration/restore compatibility tests for databases created before this feature.
- [x] Complete accessibility and keyboard-only review.
- [x] Add concise in-product explanations for scheduled, unclassified, and distraction time.
- [x] Document privacy behavior and calculation policy.
- [x] Run format, lint, typecheck, unit tests, frontend build, and native smoke test.

Acceptance: existing databases upgrade safely, calculations remain explainable, and the full flow
passes automated and native smoke testing.

Release-readiness behavior: historical dates resolve immutable effective-dated schedule revisions
and append-only local-date overrides. Changing a future revision never changes prior expectations,
and finalized periods freeze their resolved per-date schedule map. No schedule operation rewrites
persisted task entries or classifications. Modal editors expose dialog semantics,
keep keyboard focus inside the active dialog, close with Escape when safe, and restore prior focus.

## Historical-schedule decision

Implemented: append-only revisions use an inclusive `effective_from` local date. Resolution chooses
the latest applicable revision, then applies an active override for the exact date. Backdated changes
are explicit corrections, and finalized periods preserve resolved per-date snapshots.

## Deferred ideas

- [ ] Optional macOS idle detection using system idle duration only.
- [ ] Private activity timeline for helping fill gaps.
- [ ] Application/category tracking, opt-in and local-only.
- [ ] Calendar integration for suggesting offline work or meetings.
- [ ] Pomodoro or configurable focus/break cycles.
- [x] Temporary schedule overrides, holidays, leave, and vacation.
- [ ] Goals and non-punitive weekly trends.
- [ ] Distraction alerts or website blocking.

None of these should block the schedule, classification, reporting, and export foundation.

## Product references

- [RescueTime work schedule and breaks](https://help.rescuetime.com/article/454-configuring-your-work-settings)
- [Toggl Track reminders and idle detection](https://support.toggl.com/focus/toggl-focus-desktop-app)
- [Toggl Track private activity timeline](https://support.toggl.com/the-timeline-feature)
- [Clockify timer, breaks, reminders, and idle detection](https://clockify.me/features/timer)
- [TrackingTime work schedules and automatic gap detection](https://support.trackingtime.co/en/articles/2920630-timecards)
- [Timely expected capacity and logged-time status](https://www.timely.com/help/handbook/people-team-management/using-the-control-feature/)
