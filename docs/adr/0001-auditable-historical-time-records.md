# ADR 0001: Auditable historical time records

- Status: Accepted
- Date: 2026-07-15

## Context

Tempo separates a reusable **task** from a **time entry**. A task describes work that may happen
many times. A time entry is one recorded interval, such as working on that task from 09:00 to 10:00.
Reports and exports are accounting outputs derived from time entries.

Tasks have one optional category and multiple tags as defaults. If reports read mutable task, group,
category, or tag labels directly, editing those labels can silently change an old report. Corrections
are still necessary when the original entry was wrong, but they must be deliberate and auditable.

## Decision

1. Starting a timer snapshots the task ID and visible task/group/category/tag labels onto the entry.
   Changing a task or label later affects future entries only.
2. A category is exclusive. Category totals, including Uncategorized, must equal total tracked time.
   Tags overlap and their totals are explicitly non-additive.
3. Editing an entry in History is an explicit historical correction. It requires a reason and an
   acknowledgement that reports and future exports can change.
4. Every correction atomically appends an immutable before/after revision. Revisions cannot be
   updated or deleted through the database.
5. Reports aggregate renamed category/tag snapshots separately by stable ID plus historical name.
   Filters use the stable ID and therefore include every historical name version of that label.
6. A report date range can be finalized. While finalized, database triggers reject overlapping
   entry changes, new tracking, work-note changes, and gap-classification changes. A running timer or
   classification must be stopped before finalization. The weekly schedule is snapshotted so its
   workday context is also reproducible after later Settings changes.
7. Unlocking requires a reason. Finalization and unlock records remain stored for audit purposes.
8. Exports identify when they were generated. Existing exported files never change; regenerating an
   unlocked period may produce different results after an audited correction.

## Consequences

- Historical reports are stable when task/group labels are renamed.
- A deliberate correction changes all subsequently generated reports covering that entry, while
  total time changes only if its interval changes.
- Finalized periods are suitable for protecting invoiced or submitted records, but users must unlock
  them before correcting a genuine mistake.
- Snapshot columns duplicate a small amount of label data. This is intentional accounting provenance,
  not a cache.
- The audit history records correction reasons and exact before/after values; it is not an undo stack.

## Invariants

- The same entry timestamps produce the same duration in History, Reports, CSV, Excel, and JSON.
- Category totals reconcile exactly with tracked time; tag totals are never presented as additive.
- A failed correction creates no revision.
- A successful correction creates exactly one immutable revision.
- No mutation covered by a finalized period can partially succeed.
