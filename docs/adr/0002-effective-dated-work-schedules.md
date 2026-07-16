# ADR 0002: Effective-dated work schedules

- Status: Accepted
- Date: 2026-07-16

## Context

Work schedules define planning expectations, not tracked work. Applying today's weekly schedule to
all past dates can silently change old coverage, non-worked, and unclassified totals after a Settings
change. Entries and classifications are timestamped facts and must never be rewritten to compensate.

## Decision

1. Every weekly schedule save appends an immutable revision with an inclusive local
   `effectiveFrom` date. It never updates or deletes an earlier revision.
2. A date resolves the revision with the latest `effectiveFrom <= date`. If more than one revision
   has the same effective date, the latest appended row is the explicit correction.
3. A local-date override takes precedence over the weekly revision for that date only. Empty blocks
   mean no planned hours; custom blocks replace that weekday's normal blocks. Removing an override
   appends a tombstone event instead of deleting history.
4. Backdated revisions require a reason and acknowledgement because they change non-finalized
   historical schedule reports. Backdated overrides require a reason/name and acknowledgement.
5. Finalized periods freeze the fully resolved schedule for every date in their range. Later
   revisions or overrides cannot change them.
6. Schedule boundaries are interpreted in the machine's local timezone for that calendar date.
   Existing local-day and DST interval rules remain authoritative.

## Accounting precedence

For each report date:

1. Use the finalized per-date snapshot when viewing the exact active finalized range.
2. Otherwise apply the active local-date override, if any.
3. Otherwise apply the latest effective weekly revision.
4. The migrated legacy schedule is the baseline revision from `0001-01-01`.

## Consequences

- Changing next month's hours does not change last month's schedule-derived totals.
- Holidays, leave, and exceptional hours affect one explicit local date without changing the weekly
  pattern.
- Reports and CSV/Excel/JSON use the same per-date schedule map, preserving accounting parity.
- Revisions and override events are append-only audit data. They are not an undo stack.
- Tracked task time remains valid work inside or outside every schedule revision.
