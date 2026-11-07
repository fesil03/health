# Vitals

Personal health dashboard (repo `health`, app name **Vitals**). Installable app (PWA) on GitHub Pages, data kept on each device
and synced through a **private** repo, encrypted before it leaves the device.

Live: https://fesil03.github.io/health/ · Spec: "Health Dashboard — Build Spec v1" (Claude project "Health")

## How data is kept

- Each device keeps a full copy in IndexedDB and works offline.
- Sync uses the private repo `fesil03/health-data`. Each device writes only its own files
  (`devices/<deviceId>/<YYYY-MM>.enc`) and reads everyone's. Newest edit wins per record;
  deletes are kept as tombstones.
- Files are gzipped, then encrypted with AES-256-GCM. The key is derived from a passphrase
  (PBKDF2-SHA256, 600k iterations) and stored on the device as a non-exportable key.
  `meta.json` holds only the salt and a key check. Lose the passphrase and the cloud copy
  can't be opened; local data and the "Export backup" file are unaffected.
- This public repo holds code only. Never commit exports or backups (`*.zip` is ignored).

## Set up a device

1. Create a fine-grained GitHub token: Settings → Developer settings → Fine-grained tokens →
   only `fesil03/health-data` → Repository permissions → Contents: Read and write.
2. Open the app → Settings → Sync → paste the token → Continue.
3. First device: choose the passphrase (save it in your password manager).
   Other devices: enter the same passphrase.

## Import Samsung Health

Samsung Health → ☰ → Settings → Download personal data. Then Import → pick the ZIP or the CSVs.
Re-importing overlapping exports is safe.

## Develop

```bash
npm install
npm run dev          # local app
npm test             # unit tests (also run in CI before deploy)
npm run test:real    # parser against a real export in ../samsung-export (never committed)
CHROME_PATH=/usr/bin/google-chrome npm run smoke   # browser test: import, sync, 2nd device
```

Branch per phase; merge to `main` after tests pass. Merging deploys, then CI tags the release
with `package.json`'s version (bump it in each phase branch). To roll back, redeploy an old tag.
