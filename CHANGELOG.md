# Changelog

## v0.2.4 — New look (2026-11-08)

- New palette: deep blue, aged-lume cream for what you tap,
  steel grey for secondary text, one orange hand for "now".
- The top of the Log screen shows today as a Summary (default), a Timeline or Totals,
  switched with one tap; the last choice is remembered on each device. Each kind of entry has one
  colour and shape, used at the top, in its section and in the log.
- Sections are separated by space and hairlines instead of boxes; one typeface (Archivo,
  bundled so it works offline), condensed for titles and numbers.

## v0.2.3 — Time per card (2026-11-08)

- The "When" row at the top is replaced by a small time button on each card (water, coffee,
  stool, supplements, alcohol and nicotine) and a time choice in the weight sheet. It applies
  only to that card and goes back to Now after logging.
- Fixed: right after connecting a device, the badge said "Synced" before the first sync had run.

## v0.2.2 — Easier stool details, supplement times (2026-11-08)

- The Stool card lists today's entries; ones without details say "Add details →".
- A supplement's time can be changed from its entry. Moving it to another day unticks it
  on the old day and ticks it on the new one.

## v0.2.1 — Log after the fact (2026-11-08)

- New "When" row on the Log screen: Now, 15 min, 30 min, 1 h or 2 h ago, or pick a time.
  It applies to the next entry, then goes back to Now. The confirmation shows the time used.

## v0.2.0 — Phase 2: quick logging (2026-11-08)

- New **Log** tab (opens by default) with day navigation, so past days can be filled in or fixed.
- One-tap logging with an Undo toast: water (glass 250 ml, bottle 350 ml, progress and pace line),
  coffee presets (caffeine = shots × 64 mg; café drinks marked estimated; adjust shots via Details),
  stool (time saved on tap; Bristol type, colour, ease, urgency, completeness, blood, duration later),
  alcohol (grams computed from volume and ABV), nicotine (cigarette, vape, pouch), supplements
  (one tick per day, morning and night groups), weight and body fat.
- A "see a doctor if it repeats" note for blood, or black, red or pale stool.
- Paste `#meal` and `#labs` blocks written by Claude; pasting the same block twice doesn't duplicate.
- Every entry can be edited (including its time) or deleted; deletes sync as tombstones.
- Presets for coffee, supplements, alcohol and water are editable in Settings and shared by all devices.
  Starting or stopping a supplement adds a chart note automatically.

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
