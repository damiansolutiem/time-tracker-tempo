# Tempo

Tempo is a lightweight, local-first desktop time tracker built for macOS. Its goal is to keep the
current task visible and easy to control while preventing forgotten timers from accumulating
unverified time. All user data lives in a local SQLite database; no account or cloud service is
required.

Tempo includes tasks and manual timing, timestamped work-note lists, flexible task groups, task CSV/XLSX
import/export, a macOS status bar, history and corrections, work confirmation, date-range reports,
CSV/Excel/JSON report export, database backup/restore, and launch at login. Tasks, timer state, history,
report inputs, work-check settings, and authoritative
confirmation deadlines are backed by local SQLite. Groups can represent clients, departments,
projects, or other contexts. Reports group time by local day, historical group, and task. Ignored
work checks stop at their original deadline after the configured grace period.

## Repository layout

```text
apps/desktop       React 19 + Vite + Tauri 2 desktop application
packages/domain    Shared, runtime-agnostic domain types
docs               Product, technical, and delivery specifications
```

## Prerequisites (macOS)

- Node.js 22 or newer
- pnpm 11.1.2 (`corepack enable && corepack prepare pnpm@11.1.2 --activate`)
- Rust stable via [rustup](https://rustup.rs/)
- Xcode Command Line Tools (`xcode-select --install`)
- Tauri's [macOS prerequisites](https://v2.tauri.app/start/prerequisites/)

## Setup and development

```bash
pnpm install
pnpm dev             # browser-hosted frontend shell
pnpm dev:desktop     # full Tauri desktop application
```

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build           # production frontend
pnpm build:desktop   # native app bundle; requires Rust and macOS toolchain
pnpm package:macos:production  # Tempo, dev.damian.tempo
pnpm package:macos:development # Tempo Dev, isolated identity/data and badged icon
```

The current release defaults are the product name **Tempo**, bundle identifier
`dev.damian.tempo`, and Apple Silicon (`aarch64`) packages. These are configuration values rather
than architectural assumptions; see [Release packaging](docs/RELEASING.md) before changing them.

The `compiler-config.test.ts` guard fails if the React Compiler plugin is removed from Vite.

## Data and privacy

SQLite is the source of truth. Timestamps are stored as UTC ISO-8601 strings and converted to local
time only for display and calendar grouping. Timer elapsed time is derived from timestamps—Tempo
will never write a counter every second. Reports export to CSV/JSON, and Settings provides native
database backup and validated restore workflows documented in
[Data portability](docs/DATA_PORTABILITY.md).

Development builds use `tempo-dev.db`; production builds use `tempo.db`. This prevents hot-reload
testing from changing data in an installed copy of Tempo.

Tasks have an optional current group, while time entries retain the group that applied when tracking
started. Reassigning a task therefore does not rewrite historical client or department reports.
Tasks may use an optional, editable human-friendly Task ID. It is stored separately from the
immutable internal UUID Tempo uses for database relationships.

Each time entry can contain multiple work notes. Notes record creation and modification times and
carry extensible structured details; optional time spent is the first supported detail and does not
change the authoritative timer duration.

Closing the main window keeps Tempo available in the status bar. Choose **Quit Tempo** from its menu
to terminate the process. On Windows, the same controller uses the tray tooltip and menu because
Windows does not support a status-item text title.

Settings can register Tempo to start automatically at login. Login launches remain hidden in the
menu bar; manual launches show the main window normally. An unfinished timer still invokes the
restart-recovery confirmation flow in either mode.

Work checks default to 60 minutes with a five-minute grace period. Enable macOS notification
permission from Settings if you also want a system notification; the always-on-top confirmation
window works independently of notification permission.

## Status

See [Implementation plan](docs/IMPLEMENTATION_PLAN.md) for the vertical slices and acceptance
criteria. The project is intended to be open source; MIT is the proposed license pending final
project naming and ownership decisions.
