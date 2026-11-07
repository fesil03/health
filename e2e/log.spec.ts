import { expect, test, type Page } from '@playwright/test';
import { device, FakeGitHub } from './helpers';

test.use({ timezoneId: 'Asia/Shanghai' });

const log = (p: Page) => p.getByTestId('day-log');
const toast = (p: Page) => p.getByRole('status');

test('quick logging: water, undo, coffee shots, stool details, supplements, alcohol, weight, paste', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('log-day')).toHaveText('Today');

  // Water + undo
  await page.getByRole('button', { name: '+ Glass 250 ml' }).click();
  await page.getByRole('button', { name: '+ Bottle 350 ml' }).click();
  await expect(page.getByTestId('water-total')).toHaveText('600 / 2,000 ml');
  await page.getByRole('button', { name: '+ Glass 250 ml' }).click();
  await expect(page.getByTestId('water-total')).toHaveText('850 / 2,000 ml');
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByTestId('water-total')).toHaveText('600 / 2,000 ml');

  // Coffee, then 3 shots via Details
  await page.getByRole('button', { name: 'Double espresso (home)' }).click();
  await expect(toast(page)).toContainText('128 mg');
  await toast(page).getByRole('button', { name: 'Details' }).click();
  await page.getByRole('button', { name: 'More shots' }).click();
  await expect(page.getByText('192 mg caffeine')).toBeVisible();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(log(page)).toContainText('192 mg');

  // Stool: one tap, then details with a warning colour
  await page.getByRole('button', { name: 'Log stool now' }).click();
  await toast(page).getByRole('button', { name: 'Details' }).click();
  await page.getByRole('radio', { name: 'Type 4' }).click();
  await page.getByRole('radio', { name: 'black' }).click();
  await expect(page.getByTestId('doctor-note')).toBeVisible();
  await page.getByRole('radio', { name: 'brown' }).click();
  await expect(page.getByTestId('doctor-note')).toHaveCount(0);
  await page.getByRole('group', { name: 'Felt complete' }).getByRole('button', { name: 'Yes' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(log(page)).toContainText('Type 4, brown');

  // Supplements tick / untick
  await page.getByRole('button', { name: 'Zinc', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Zinc (taken)' })).toBeVisible();
  await expect(log(page)).toContainText('Zinc');

  // Alcohol
  await page.getByRole('button', { name: 'Beer 330 ml' }).click();
  await expect(log(page)).toContainText('13 g alcohol');

  // Weight
  await page.getByRole('button', { name: /^Weight/ }).click();
  await page.getByLabel('Weight (kg)').fill('72,5');
  await page.getByLabel('Body fat (%)').fill('18');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(log(page)).toContainText('72.5 kg · 18% fat');

  // Paste a meal (no time = now) and labs (stored on their own date)
  await page.getByRole('button', { name: /Meal \/ labs/ }).click();
  await page.getByTestId('paste-box').fill(`#meal v1
meal: lunch
items: rice; eggplant
kcal: 700
fiber_g: 4
oil_heavy: yes

#labs v1
date: 2026-03-14
lab: Fleury
marker | value | unit | ref_low | ref_high
Vitamin D | 32 | ng/mL | 30 | 100`);
  await expect(page.getByTestId('paste-preview')).toContainText('lunch: rice; eggplant');
  await expect(page.getByTestId('paste-preview')).toContainText('Labs 2026-03-14: 1 markers');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(log(page)).toContainText('Lunch');
  await expect(log(page)).not.toContainText('Labs');

  // Edit a time into yesterday: it leaves today's list
  await log(page).getByRole('button', { name: /Beer 330 ml/ }).click();
  const yesterday = await page.evaluate(() => {
    const d = new Date(Date.now() - 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T21:00`;
  });
  await page.getByLabel('Time').fill(yesterday);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(log(page)).not.toContainText('Beer');
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(log(page)).toContainText('Beer 330 ml');
  await page.getByRole('button', { name: 'Next day' }).click();

  // Delete
  await log(page).getByRole('button', { name: /Lunch/ }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(log(page)).not.toContainText('Lunch');
});

test('presets: add a supplement, note added, shows on Log', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings' }).click();
  const supp = page.getByTestId('supplement-presets');
  await supp.locator('summary').click();
  await supp.getByPlaceholder('New supplement').fill('Magnesium glycinate');
  await supp.getByRole('button', { name: 'Add' }).click();
  await supp.getByRole('button', { name: 'Save' }).click();
  await expect(toast(page)).toContainText('Started Magnesium glycinate');
  await page.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Magnesium glycinate', exact: true })).toBeVisible();
  await expect(log(page)).toContainText('Started Magnesium glycinate');
});

test('a coffee logged on the phone reaches the computer', async ({ browser }) => {
  const gh = new FakeGitHub();
  const outside: string[] = [];
  const setup = async (p: Page, first: boolean) => {
    await p.getByRole('button', { name: 'Settings' }).click();
    await p.getByLabel(/GitHub token/).fill('test-token');
    await p.getByRole('button', { name: 'Continue' }).click();
    await p.getByPlaceholder('Passphrase', { exact: true }).fill('a long test passphrase');
    if (first) await p.getByPlaceholder('Same passphrase again').fill('a long test passphrase');
    await p.getByRole('button', { name: first ? 'Create lock and sync' : 'Unlock and sync' }).click();
    await expect(p.getByTestId('sync-pill')).toHaveText('Synced', { timeout: 30_000 });
  };

  const phone = await device(await browser.newContext({ timezoneId: 'Asia/Shanghai' }), gh, outside);
  await phone.goto('./');
  await setup(phone, true);
  await phone.getByRole('button', { name: 'Log', exact: true }).click();
  await phone.getByRole('button', { name: 'Coconut latte' }).click();
  await phone.getByRole('button', { name: 'Home', exact: true }).click();
  await phone.getByRole('button', { name: 'Sync now' }).click();
  await expect(phone.getByTestId('sync-pill')).toHaveText('Synced');
  await expect.poll(() => [...gh.blobs.keys()].length).toBeGreaterThan(1);

  const mac = await device(await browser.newContext({ timezoneId: 'Asia/Shanghai' }), gh, outside);
  await mac.goto('./');
  await setup(mac, false);
  await mac.getByRole('button', { name: 'Log', exact: true }).click();
  await expect(log(mac)).toContainText('Coconut latte');
  await expect(log(mac)).toContainText('128 mg (est.)');
  expect(outside).toEqual([]);
});
