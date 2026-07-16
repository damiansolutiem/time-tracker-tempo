# Release packaging

## Current macOS defaults

Tempo currently packages for Apple Silicon only. Two installable flavors are available:

```bash
pnpm package:macos:production
pnpm package:macos:development
```

Both commands explicitly produce the macOS application bundle and disk image for the
`aarch64-apple-darwin` target. Because Tauri cleans its shared bundle directory between builds, the
packaging script copies durable outputs to `apps/desktop/release-artifacts/production` and
`apps/desktop/release-artifacts/development`.

| Flavor      | App name    | Bundle identifier      | Icon                            | Data isolation                |
| ----------- | ----------- | ---------------------- | ------------------------------- | ----------------------------- |
| Production  | `Tempo`     | `dev.damian.tempo`     | Green Tempo icon                | Production app-data directory |
| Development | `Tempo Dev` | `dev.damian.tempo.dev` | Blue icon with orange DEV badge | Separate Dev app-data folder  |

The different bundle identifiers let both applications be installed and launched simultaneously.
Each identifier resolves to a different macOS app-data directory. Development additionally uses
`tempo-dev.db` while Production uses `tempo.db`, providing a second isolation boundary. Hot reload
and the packaged Development flavor use the same Dev identity and filename. Launch-at-login
registration is also scoped to the installed application identity.

| Setting           | Current value             | Configured in                                                   |
| ----------------- | ------------------------- | --------------------------------------------------------------- |
| Product name      | `Tempo`                   | `apps/desktop/src-tauri/tauri.conf.json`                        |
| Bundle identifier | `dev.damian.tempo`        | `apps/desktop/src-tauri/tauri.conf.json`                        |
| Architecture      | Apple Silicon (`aarch64`) | Flavor-specific package scripts                                 |
| Bundle formats    | `.app`, `.dmg`            | Tauri bundle configuration and package script                   |
| Version           | `0.1.0` initially         | root/desktop package metadata, Tauri config, and Cargo manifest |

These are release defaults, not permanent code assumptions. They can be changed deliberately in a
future release. Do not scatter the product name or identifier into new storage, domain, or feature
code.

## Changing identity later

Changing the product name affects the displayed application and installer names. Changing the
bundle identifier is more consequential: macOS treats it as a different application identity, and
Tauri's application data directory may also change. Before changing `dev.damian.tempo`, add and test
an explicit migration or import flow for the existing database, preferences, launch-at-login
registration, signing/notarization records, and any updater metadata. Never silently strand an
existing `tempo.db`.

## Adding Intel support later

The application code must remain architecture-neutral. Intel or universal packaging can be added
later by installing the `x86_64-apple-darwin` Rust target and introducing a separate explicit build
command. Do not change the Apple Silicon command in place; keeping architecture-specific commands
makes release artifacts unambiguous.

## Remaining production-release work

The package command can create unsigned local artifacts now. Public distribution additionally
requires the final application icon, Apple Developer signing credentials, hardened-runtime signing,
notarization and stapling, release automation, and installation/upgrade smoke tests.
