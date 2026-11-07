import { expect, test } from '@playwright/test';
import { device, FakeGitHub } from './helpers';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(process.cwd(), 'tests/fixtures/samsung');
const fixtureFiles = readdirSync(FIXTURES).map((f) => join(FIXTURES, f));

test('import, encrypted sync to a second device, reload keeps the key', async ({ browser }) => {
  const gh = new FakeGitHub();
  const outside: string[] = [];

  // Phone: empty state -> import fixtures -> preview -> save
  const phoneCtx = await browser.newContext();
  const phone = await device(phoneCtx, gh, outside);
  await phone.goto('./');
  await phone.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(phone.getByText('No data yet')).toBeVisible();
  await expect(phone.getByTestId('sync-pill')).toHaveText('Not syncing');

  await phone.getByRole('button', { name: 'Import', exact: true }).click();
  await phone.getByTestId('file-input').setInputFiles(fixtureFiles);
  const preview = phone.getByTestId('preview');
  await expect(preview).toContainText('Sleep nights');
  await expect(preview.getByRole('row', { name: /Sleep nights/ })).toContainText('2');
  await phone.getByRole('button', { name: /Save \d+ records/ }).click();
  await expect(phone.getByTestId('saved')).toBeVisible();
  await phone.getByRole('button', { name: 'See my data' }).click();
  await expect(phone.getByTestId('nights')).toContainText('00:47 → 10:40');
  await expect(phone.getByTestId('nights')).toContainText('88');

  // Phone: set up sync (creates the lock)
  await phone.getByRole('button', { name: 'Settings' }).click();
  await phone.getByLabel(/GitHub token/).fill('test-token');
  await phone.getByRole('button', { name: 'Continue' }).click();
  await phone.getByPlaceholder('Passphrase', { exact: true }).fill('a long test passphrase');
  await phone.getByPlaceholder('Same passphrase again').fill('a long test passphrase');
  await phone.getByRole('button', { name: 'Create lock and sync' }).click();
  await expect(phone.getByTestId('sync-pill')).toHaveText('Synced', { timeout: 30_000 });

  // The repo holds only scrambled files.
  const stored = [...gh.blobs.values()].join('\n');
  expect(stored).not.toContain('sleep-a');
  expect(stored).not.toContain('Cycling');
  expect(Object.keys(gh.trees.get(gh.commits.get(gh.head!)!)!).sort()).toEqual(
    expect.arrayContaining(['meta.json', expect.stringMatching(/^devices\/\w+\/2026-11\.enc$/)])
  );

  // Reload: key survives in IndexedDB, no passphrase needed.
  await phone.reload();
  await expect(phone.getByTestId('sync-pill')).toHaveText('Synced', { timeout: 30_000 });

  // Computer: wrong passphrase refused, right one pulls the data.
  const macCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const mac = await device(macCtx, gh, outside);
  await mac.goto('./');
  await mac.getByRole('button', { name: 'Settings' }).click();
  await mac.getByLabel(/GitHub token/).fill('test-token');
  await mac.getByRole('button', { name: 'Continue' }).click();
  await expect(mac.getByText('already holds locked data')).toBeVisible();
  await mac.getByPlaceholder('Passphrase', { exact: true }).fill('wrong passphrase');
  await mac.getByRole('button', { name: 'Unlock and sync' }).click();
  await expect(mac.getByText('does not match')).toBeVisible({ timeout: 30_000 });
  await mac.getByPlaceholder('Passphrase', { exact: true }).fill('a long test passphrase');
  await mac.getByRole('button', { name: 'Unlock and sync' }).click();
  await expect(mac.getByTestId('sync-pill')).toHaveText('Synced', { timeout: 30_000 });
  await mac.getByRole('button', { name: 'Home' }).click();
  await expect(mac.getByTestId('nights')).toContainText('00:47 → 10:40');
  await expect(mac.getByTestId('data-summary')).toContainText('Workouts');

  // Backup export works
  await mac.getByRole('button', { name: 'Settings' }).click();
  const [dl] = await Promise.all([mac.waitForEvent('download'), mac.getByRole('button', { name: 'Export backup' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^health-backup-\d{4}-\d{2}-\d{2}\.json$/);

  expect(outside).toEqual([]); // nothing but our own origin and GitHub's API
});
