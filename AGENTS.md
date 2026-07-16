# Tempo engineering priorities

## 1. Time-accounting correctness is the highest priority

Tempo's primary responsibility is to record and summarize time accurately. Treat every change to
timers, entries, schedules, classifications, history, reports, or exports as accounting-critical.
Visual polish and feature velocity never justify ambiguous labels or inconsistent totals.

- Define the accounting meaning and interval boundaries of every displayed total.
- Use persisted timestamps as the source of truth. Derive live values from a captured timestamp and
  the current clock; never accumulate time with per-second counters.
- Clip intervals to the requested local day/range, merge overlaps before summing, and handle running
  entries, midnight boundaries, planned breaks, ignored time, overtime, and DST explicitly.
- A label such as “worked” must say whether it means all tracked time or only time inside planned
  blocks. Prefer total tracked time as the primary figure. Treat the schedule as a planning guide,
  never as a hard boundary or a judgment about whether task time is legitimate work; show
  during/beyond-plan portions only as secondary context.
- The same scope must produce the same total in Timer, History, Reports, CSV, Excel, and menu-bar
  surfaces. Do not silently use different formulas for equivalent labels.
- Preserve task time as working time regardless of task type. Meetings and offline work are work
  when tracked to a task. Gap classifications do not become task time; only `ignored` changes the
  scheduled expectation.

## Required verification for accounting changes

- Add or update deterministic tests for the affected calculation and at least one parity assertion
  between consuming surfaces or repositories.
- Cover relevant boundary cases: stopped and running entries, before/inside/after schedule, entries
  outside schedule, local midnight, overlapping intervals, and DST when applicable.
- When totals intentionally differ, test the reconciliation equation and make the breakdown visible
  in the UI. For daily workday coverage: `total tracked = tracked in schedule + outside schedule`.
- Run formatting, lint, strict typecheck, the complete test suite, and the production frontend build
  before declaring a slice complete.
- Never dismiss a reported total mismatch as cosmetic. Reproduce it from timestamps, identify the
  exact scope difference, and either unify the calculation or label and reconcile it clearly.

## 2. Accessibility and keyboard behavior are part of every UI feature

Do not postpone accessibility to a later polish pass. Every new or changed interaction must work
with a keyboard and expose clear semantics to assistive technology before the slice is complete.

- Prefer native semantic elements (`button`, `input`, `select`, headings, landmarks) over clickable
  generic containers. Give icon-only controls and otherwise unlabeled fields explicit accessible
  names.
- Preserve a logical heading structure, reading order, and Tab order. Never use a positive
  `tabIndex` to force focus order.
- Give each application region one deliberate scroll owner. Keep the document/root fixed for the
  desktop shell, avoid nested page-level vertical scrolling, and reserve independent scrolling for
  intentional regions such as the sidebar content and main content panes.
- Keep focus visibly styled. After client-side navigation, move focus to the new page content; keep
  the application skip-to-content target working.
- All modal dialogs must identify their title and description, trap focus, close with Escape when
  safe, prevent dismissal while a destructive or atomic operation is busy, and restore focus to the
  control that opened them. Bound dialogs to the viewport and make overflowing dialog content
  keyboard-scrollable so actions never become unreachable. Use the shared `useModalDialog` behavior
  rather than creating ad hoc key listeners.
- Composite widgets must follow their expected keyboard pattern. In particular, tabs use arrow
  keys plus Home/End and correctly connect `tab`, `tablist`, and `tabpanel` semantics.
- Announce asynchronous success/loading feedback with status semantics and actionable failures with
  alert semantics. Do not make live elapsed-time updates announce every second.
- Do not rely on color, icons, hover, sound, or placeholder text alone to communicate meaning.
  Maintain sufficient contrast, usable hit targets, and layouts that remain understandable at the
  narrowest supported window size.
- Respect reduced-motion preferences and avoid unnecessary focus stealing. Notifications and
  background reminders must not bring a window to the front unless the user explicitly requests it.

## Required verification for UI changes

- Exercise the complete changed flow using only the keyboard: navigation, opening, editing,
  validation, submission, cancellation, and focus restoration.
- Check accessible names, roles, relationships, error/status announcements, disabled states, and
  reading order for every changed control.
- Add deterministic tests for reusable keyboard/focus behavior and regressions in dialogs,
  navigation, or composite widgets.
- Run formatting, lint, strict typecheck, the complete test suite, and the production frontend build
  before declaring the UI slice complete.

These instructions apply to the root agent and every delegated agent working anywhere in this
repository.
