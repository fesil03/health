import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { deriveKey, newSalt, openJson, sealJson } from '../src/lib/crypto';
import { HealthDB } from '../src/lib/db';
import type { HealthRecord } from '../src/lib/model';
import { GitHubStore } from '../src/lib/sync/github';
import { MemoryStore } from '../src/lib/sync/store';
import { devicePath, incomingWins, sync, unlock, WrongPassphraseError } from '../src/lib/sync/sync';

const FAST = 1000; // PBKDF2 iterations for tests only

const rec = (id: string, deviceId: string, updatedAt: number, extra: Partial<HealthRecord> = {}): HealthRecord => ({
  id,
  kind: 'water',
  day: '2026-11-07',
  at: '2026-11-07T09:00:00',
  updatedAt,
  deviceId,
  source: 'manual',
  data: { ml: 250 },
  ...extra
});

describe('crypto', () => {
  it('round-trips and binds the file path', async () => {
    const key = await deriveKey('correct horse', newSalt(), FAST);
    const text = await sealJson(key, { hello: 'world' }, 'devices/a/2026-11.enc');
    expect(text).not.toContain('world');
    expect(await openJson(key, text, 'devices/a/2026-11.enc')).toEqual({ hello: 'world' });
    await expect(openJson(key, text, 'devices/b/2026-11.enc')).rejects.toThrow();
  });

  it('a different passphrase cannot open the file', async () => {
    const salt = newSalt();
    const text = await sealJson(await deriveKey('one', salt, FAST), 1, 'p');
    await expect(openJson(await deriveKey('two', salt, FAST), text, 'p')).rejects.toThrow();
  });
});

describe('merge rule', () => {
  it('newest edit wins, ties broken by device id', () => {
    expect(incomingWins(undefined, rec('a', 'x', 1))).toBe(true);
    expect(incomingWins(rec('a', 'x', 2), rec('a', 'y', 1))).toBe(false);
    expect(incomingWins(rec('a', 'x', 1), rec('a', 'y', 2))).toBe(true);
    expect(incomingWins(rec('a', 'b', 1), rec('a', 'a', 1))).toBe(false);
  });
});

describe('two-device sync', () => {
  it('unlocks with the same passphrase and rejects a wrong one', async () => {
    const store = new MemoryStore();
    expect((await unlock(store, 'pw', FAST)).created).toBe(true);
    expect((await unlock(store, 'pw', FAST)).created).toBe(false);
    await expect(unlock(store, 'nope', FAST)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('moves records both ways, keeps only scrambled text remotely, propagates deletes', async () => {
    const store = new MemoryStore();
    const phone = new HealthDB(`p-${Math.random()}`);
    const mac = new HealthDB(`m-${Math.random()}`);
    const { key: kp } = await unlock(store, 'pw', FAST);
    const { key: km } = await unlock(store, 'pw', FAST);

    await phone.saveLocal([rec('w1', 'phone', 100), rec('w2', 'phone', 100)]);
    const r1 = await sync(phone, store, kp, 'phone', 1);
    expect(r1.pushedFiles).toBe(1);
    expect(store.files.get(devicePath('phone', '2026-11'))!.text).not.toContain('w1');

    const r2 = await sync(mac, store, km, 'mac', 2);
    expect(r2).toMatchObject({ pulledFiles: 1, mergedRecords: 2, pushedFiles: 0 });
    expect(await mac.records.count()).toBe(2);

    // Mac edits w1 and deletes w2; phone picks both up.
    await mac.saveLocal([
      rec('w1', 'mac', 200, { data: { ml: 500 } }),
      rec('w2', 'mac', 200, { deleted: true })
    ]);
    await sync(mac, store, km, 'mac', 3);
    const r3 = await sync(phone, store, kp, 'phone', 4);
    expect(r3.mergedRecords).toBe(2);
    expect((await phone.records.get('w1'))!.data).toEqual({ ml: 500 });
    expect((await phone.records.get('w2'))!.deleted).toBe(true);
    expect(await phone.live('water')).toHaveLength(1);

    // Nothing changed: nothing pulled or pushed.
    const r4 = await sync(phone, store, kp, 'phone', 5);
    expect(r4).toMatchObject({ pulledFiles: 0, pushedFiles: 0 });
  });

  it('keeps a month pending if it was written to during the sync', async () => {
    const store = new MemoryStore();
    const db = new HealthDB(`d-${Math.random()}`);
    const { key } = await unlock(store, 'pw', FAST);
    await db.saveLocal([rec('a', 'phone', 1)]);
    const pushedSnapshot = await db.getSetting<Record<string, number>>('dirtyMonths', {});
    await db.saveLocal([rec('b', 'phone', 2)]); // lands after the snapshot
    await db.clearPushed(pushedSnapshot);
    expect(await db.getSetting('dirtyMonths', {})).toHaveProperty('2026-11');
    await sync(db, store, key, 'phone', 3);
    expect(await db.getSetting('dirtyMonths', {})).toEqual({});
  });
});

describe('GitHubStore', () => {
  type Call = { method: string; url: string; body?: unknown };
  const fakeGitHub = (handlers: Record<string, (body: unknown) => [number, unknown]>) => {
    const calls: Call[] = [];
    const fn = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url.replace('https://api.github.com/repos/fesil03/health-data', '');
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method, url: path, body });
      const h = handlers[`${method} ${path}`];
      const [status, json] = h ? h(body) : [404, { message: 'Not Found' }];
      return new Response(JSON.stringify(json), { status });
    }) as typeof fetch;
    return { fn, calls };
  };
  const cfg = { owner: 'fesil03', repo: 'health-data', token: 't' };

  it('refuses a public data repo', async () => {
    const { fn } = fakeGitHub({ 'GET ': () => [200, { default_branch: 'main', private: false }] });
    await expect(new GitHubStore(cfg, fn).check()).rejects.toThrow('private');
  });

  it('treats an empty repo as no files and makes the first commit via the contents API', async () => {
    const { fn, calls } = fakeGitHub({
      'GET ': () => [200, { default_branch: 'main', private: true }],
      'GET /git/ref/heads/main': () => [409, { message: 'Git Repository is empty.' }],
      'PUT /contents/meta.json': () => [201, { content: { sha: 'abc' } }]
    });
    const gh = new GitHubStore(cfg, fn);
    expect(await gh.list()).toEqual([]);
    expect(await gh.write([{ path: 'meta.json', text: '{}' }], 'init')).toEqual({ 'meta.json': 'abc' });
    expect(calls.at(-1)!.body).toMatchObject({ branch: 'main', content: btoa('{}') });
  });

  it('writes all files in one commit and retries when another device pushed first', async () => {
    let refPatches = 0;
    const { fn, calls } = fakeGitHub({
      'GET ': () => [200, { default_branch: 'main', private: true }],
      'GET /git/ref/heads/main': () => [200, { object: { sha: refPatches ? 'head2' : 'head1' } }],
      'GET /git/commits/head1': () => [200, { tree: { sha: 'tree1' } }],
      'GET /git/commits/head2': () => [200, { tree: { sha: 'tree2' } }],
      'POST /git/blobs': () => [201, { sha: 'blob1' }],
      'POST /git/trees': () => [201, { sha: 'newtree' }],
      'POST /git/commits': () => [201, { sha: 'c1' }],
      'PATCH /git/refs/heads/main': () => (refPatches++ === 0 ? [422, { message: 'not a fast forward' }] : [200, {}])
    });
    const out = await new GitHubStore(cfg, fn).write([{ path: 'devices/a/2026-11.enc', text: 'x' }], 'sync');
    expect(out).toEqual({ 'devices/a/2026-11.enc': 'blob1' });
    const trees = calls.filter((c) => c.url === '/git/trees');
    expect(trees.map((c) => (c.body as { base_tree: string }).base_tree)).toEqual(['tree1', 'tree2']);
  });
});
