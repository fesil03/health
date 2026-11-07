# Changelog

## v0.1.1 — App name and release tags (2026-11-07)

- App installs as **Vitals**, so it no longer clashes with Samsung Health or Apple Health.
- Each deploy to `main` is now tagged automatically with the version in `package.json`.

## v0.1 — Phase 1: data model, Samsung import, encrypted sync (2026-11-07)

- Samsung Health import from the export ZIP or CSVs: sleep (with score), sleep stages,
  hourly heart rate, hourly stress, daily steps, blood oxygen, workouts, water.
  Converts to local time, files sleep under the wake-up day, drops impossible dates,
  skips duplicates, shows a preview before saving.
- Encrypted two-way sync through the private `health-data` repo (passphrase lock,
  one commit per sync, retries if the other device pushed first).
- Home shows last nights and a summary of stored data; Settings handles sync,
  lock/disconnect and an unlocked JSON backup (export and restore).
- Installable PWA, works offline, no outside hosts except GitHub's API.
