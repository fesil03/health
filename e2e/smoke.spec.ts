import { expect, test, type BrowserContext, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const FIXTURES = join(process.cwd(), 'tests/fixtures/samsung');
const fixtureFiles = readdirSync(FIXTURES).map((f) => join(FIXTURES, f));

/** In-memory stand-in for the private GitHub repo, shared by both "devices". */
class FakeGitHub {
  blobs = new Map<string, string>();
  trees = new Map<string, Record<string, string>>(); // tree sha -> path -> blob sha
  commits = new Map<string, string>(); // commit sha -> tree sha
  head: string | null = null;
  requests: string[] = [];
  private sha = (s: string) => createHash('sha1').update(s).digest('hex');
  private addBlob(text: string) {
    const sha = this.sha(`blob ${Buffer.byteLength(text)}\0${text}`);
    this.blobs.set(sha, text);
    return sha;
  }
  private files(): Record<string, string> {
    return this.head ? { ...this.trees.get(this.commits.get(this.head)!)! } : {};
  }
  private commit(files: Record<string, string>) {
    const tree = this.sha(JSON.stringify(files));
    this.trees.set(tree, files);
    const c = this.sha(tree + Math.random());
    this.commits.set(c, tree);
    return c;
  }

  async handle(route: Route) {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace('/repos/fesil03/health-data', '');
    const method = req.method();
    this.requests.push(`${method} ${path}`);
    const body = req.postData() ? JSON.parse(req.postData()!) : {};
    const json = (status: number, data: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

    if (req.headers().authorization !== 'Bearer test-token') return json(401, { message: 'Bad credentials' });
    if (method === 'GET' && path === '') return json(200, { default_branch: 'main', private: true });
    if (method === 'GET' && path === '/git/ref/heads/main')
      return this.head ? json(200, { object: { sha: this.head } }) : json(409, { message: 'Git Repository is empty.' });
    let m;
    if (method === 'GET' && (m = /^\/git\/trees\/(\w+)$/.exec(path)))
      return json(200, {
        truncated: false,
        tree: Object.entries(this.trees.get(this.commits.get(m[1])!)!).map(([p, sha]) => ({ path: p, sha, type: 'blob' }))
      });
    if (method === 'GET' && (m = /^\/git\/blobs\/(\w+)$/.exec(path)))
      return json(200, { encoding: 'base64', content: Buffer.from(this.blobs.get(m[1])!).toString('base64') });
    if (method === 'GET' && (m = /^\/git\/commits\/(\w+)$/.exec(path))) return json(200, { tree: { sha: this.commits.get(m[1]) } });
    if (method === 'PUT' && (m = /^\/contents\/(.+)$/.exec(path))) {
      const sha = this.addBlob(Buffer.from(body.content, 'base64').toString());
      this.head = this.commit({ ...this.files(), [m[1]]: sha });
      return json(201, { content: { sha } });
    }
    if (method === 'POST' && path === '/git/blobs') return json(201, { sha: this.addBlob(body.content) });
    if (method === 'POST' && path === '/git/trees') {
      const files = { ...this.trees.get(body.base_tree)! };
      for (const e of body.tree) files[e.path] = e.sha;
      const tree = this.sha(JSON.stringify(files));
      this.trees.set(tree, files);
      return json(201, { sha: tree });
    }
    if (method === 'POST' && path === '/git/commits') {
      const c = this.sha(body.tree + Math.random());
      this.commits.set(c, body.tree);
      return json(201, { sha: c });
    }
    if (method === 'PATCH' && path === '/git/refs/heads/main') {
      this.head = body.sha;
      return json(200, {});
    }
    return json(404, { message: `fake has no ${method} ${path}` });
  }
}

async function device(ctx: BrowserContext, gh: FakeGitHub, outside: string[]) {
  await ctx.route('https://api.github.com/**', (r) => gh.handle(r));
  const page = await ctx.newPage();
  page.on('request', (r) => {
    const host = new URL(r.url()).host;
    if (host !== 'localhost:4173' && host !== 'api.github.com') outside.push(r.url());
  });
  return page;
}

test('import, encrypted sync to a second device, reload keeps the key', async ({ browser }) => {
  const gh = new FakeGitHub();
  const outside: string[] = [];

  // Phone: empty state -> import fixtures -> preview -> save
  const phoneCtx = await browser.newContext();
  const phone = await device(phoneCtx, gh, outside);
  await phone.goto('./');
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
