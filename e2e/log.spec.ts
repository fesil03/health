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

  // Supplements: each tap is a dose; a second dose shows ×2; Undo removes the last one
  await page.getByRole('button', { name: 'L-theanine', exact: true }).click();
  await expect(page.getByRole('button', { name: 'L-theanine (taken)' })).toBeVisible();
  await page.getByRole('button', { name: 'L-theanine (taken)' }).click();
  await expect(page.getByRole('button', { name: 'L-theanine (taken 2 times)' })).toContainText('×2');
  await expect(log(page).getByRole('button', { name: /L-theanine/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('button', { name: 'L-theanine (taken)' })).toBeVisible();
  await expect(log(page).getByRole('button', { name: /L-theanine/ })).toHaveCount(1);

  // Alcohol
  await page.getByRole('button', { name: 'Beer 330 ml' }).click();
  await expect(log(page)).toContainText('13 g alcohol');

  // Weight
  await page.getByRole('button', { name: /^Weight/ }).click();
  await page.getByLabel('Weight (kg)').fill('72,5');
  await page.getByLabel('Body fat (%)').fill('18');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(log(page)).toContainText('72.5 kg, 18% fat');

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
  await expect(page.getByTestId('paste-preview')).toContainText('Lunch: rice; eggplant');
  await expect(page.getByTestId('paste-preview')).toContainText('Labs: 1 markers');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(log(page)).toContainText('Lunch');
  await expect(log(page)).not.toContainText('Labs');

  // Edit a time into yesterday: it leaves today's list
  await log(page).getByRole('button', { name: /Beer 330 ml/ }).click();
  const yesterday = await page.evaluate(() => {
    const d = new Date(Date.now() - 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T21:00`;
  });
  await page.getByRole('dialog').getByLabel('Time', { exact: true }).fill(yesterday);
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

test('log time per card: minutes ago, picked time, then back to now', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-08T10:30:00+08:00'));
  await page.goto('./');
  const coffee = page.getByRole('region', { name: 'Coffee' });

  await coffee.getByRole('button', { name: 'Coffee time: Now' }).click();
  await coffee.getByRole('button', { name: '1 h ago' }).click();
  await expect(coffee.getByRole('button', { name: 'Coffee time: 1 h ago' })).toBeVisible();
  // other cards are untouched
  await expect(page.getByRole('button', { name: 'Water time: Now' })).toBeVisible();
  await coffee.getByRole('button', { name: 'Coconut latte' }).click();
  await expect(toast(page)).toContainText('09:30');
  await expect(coffee.getByRole('button', { name: 'Coffee time: Now' })).toBeVisible(); // reset after logging

  await coffee.getByRole('button', { name: 'Coffee time: Now' }).click();
  await coffee.getByRole('button', { name: 'Pick time' }).click();
  await coffee.getByLabel('Log time').fill('08:05');
  await coffee.getByRole('button', { name: 'Double espresso (home)' }).click();

  await page.getByRole('button', { name: '+ Glass 250 ml' }).click(); // water: now

  // stool card has its own time too
  const stool = page.getByRole('region', { name: 'Stool' });
  await stool.getByRole('button', { name: 'Stool time: Now' }).click();
  await stool.getByRole('button', { name: '30 min ago' }).click();
  await stool.getByRole('button', { name: 'Log stool now' }).click();

  await expect(log(page).locator('li span.w-12')).toHaveText(['08:05', '09:30', '10:00', '10:30']);

  // weight sheet has its own time
  await page.getByRole('button', { name: /^Weight/ }).click();
  await page.getByLabel('Weight (kg)').fill('72');
  await page.getByRole('dialog').getByRole('button', { name: '2 h ago' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(log(page).locator('li span.w-12').first()).toHaveText('08:05');
  await expect(log(page)).toContainText('72 kg');
  await expect(log(page).locator('li span.w-12')).toHaveText(['08:05', '08:30', '09:30', '10:00', '10:30']);
});

test('stool details from the Stool card, and supplement times can be changed', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-08T22:40:00+08:00'));
  await page.goto('./');

  // Stool logged without tapping Details: the card offers it later
  await page.getByRole('button', { name: 'Log stool now' }).click();
  const stoolList = page.getByTestId('stool-list');
  await stoolList.getByRole('button', { name: /Add details/ }).click();
  await page.getByRole('radio', { name: 'Type 5' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(stoolList).toContainText('Type 5');

  // Supplement ticked now, actually taken at 21:30
  await page.getByRole('button', { name: 'Zinc', exact: true }).click();
  await log(page).getByRole('button', { name: /Zinc/ }).click();
  await page.getByRole('dialog').getByLabel('Time', { exact: true }).fill('2026-11-08T21:30');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(log(page).getByRole('button', { name: /Zinc/ })).toContainText('21:30');

  // ...or moved to yesterday: leaves today, unticks today's chip
  await log(page).getByRole('button', { name: /Zinc/ }).click();
  await page.getByRole('dialog').getByLabel('Time', { exact: true }).fill('2026-11-07T23:00');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(log(page)).not.toContainText('Zinc');
  await expect(page.getByRole('button', { name: 'Zinc', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(log(page).getByRole('button', { name: /Zinc/ })).toContainText('23:00');
  await expect(page.getByRole('button', { name: 'Zinc (taken)' })).toBeVisible();
});

test('top of the Log screen: summary by default, one tap to switch, remembered', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByTestId('top-summary')).toBeVisible();
  await page.getByRole('radio', { name: 'Timeline' }).click();
  await expect(page.getByTestId('top-timeline')).toBeVisible();
  await page.getByRole('radio', { name: 'Totals' }).click();
  await expect(page.getByTestId('top-totals')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('top-totals')).toBeVisible();
  await page.getByRole('radio', { name: 'Summary' }).click();
  await expect(page.getByTestId('top-summary')).toBeVisible();
});

test('batch paste: several meals on their own days, repeats skipped', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-08T14:30:00+08:00'));
  await page.goto('./');
  const meals = (extra = '') => `#meal v1
time: 2026-11-07 19:30
meal: dinner
items: noodles
kcal: 650

#meal v1
time: 2026-11-08 08:40
meal: breakfast
items: eggs; toast
kcal: 380
${extra}`;

  await page.getByRole('button', { name: /Meal \/ labs/ }).click();
  await page.getByTestId('paste-box').fill(meals());
  const preview = page.getByTestId('paste-preview');
  await expect(preview).toContainText('Yesterday');
  await expect(preview).toContainText('Today');
  await page.getByRole('button', { name: 'Save 2 new meals' }).click();
  await expect(toast(page)).toContainText('Saved 2 meals');
  await expect(log(page)).toContainText('Breakfast');
  await expect(log(page)).not.toContainText('Dinner'); // filed under yesterday

  // Next time: paste the same two plus lunch
  await page.getByRole('button', { name: /Meal \/ labs/ }).click();
  await page.getByTestId('paste-box').fill(meals('\n#meal v1\ntime: 2026-11-08 13:05\nmeal: lunch\nitems: rice; tofu\nkcal: 700'));
  await expect(preview.getByText('Already logged')).toHaveCount(2);
  await page.getByRole('button', { name: 'Save 1 new meal' }).click();
  await expect(log(page).getByRole('button', { name: /Breakfast/ })).toHaveCount(1);
  await expect(log(page)).toContainText('Lunch');

  // Same paste a third time: nothing new
  await page.getByRole('button', { name: /Meal \/ labs/ }).click();
  await page.getByTestId('paste-box').fill(meals());
  await expect(page.getByRole('button', { name: 'Nothing new to save' })).toBeDisabled();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Previous day' }).click();
  await expect(log(page)).toContainText('Dinner');
});
