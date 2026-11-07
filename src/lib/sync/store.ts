// Where encrypted files live. GitHubStore in the app, MemoryStore in tests.

export interface RemoteFile {
  path: string;
  sha: string;
}

export interface RemoteStore {
  /** Every file in the repo. Empty repo -> []. */
  list(): Promise<RemoteFile[]>;
  /** File text by blob sha. */
  read(file: RemoteFile): Promise<string>;
  /** Writes several files in one commit; returns the new blob sha per path. */
  write(files: { path: string; text: string }[], message: string): Promise<Record<string, string>>;
}

/** Git's blob sha, so MemoryStore behaves like GitHub. */
async function blobSha(text: string): Promise<string> {
  const body = new TextEncoder().encode(text);
  const head = new TextEncoder().encode(`blob ${body.length}\0`);
  const all = new Uint8Array(head.length + body.length);
  all.set(head);
  all.set(body, head.length);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', all));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class MemoryStore implements RemoteStore {
  files = new Map<string, { text: string; sha: string }>();
  commits = 0;
  async list() {
    return [...this.files].map(([path, f]) => ({ path, sha: f.sha }));
  }
  async read(file: RemoteFile) {
    const f = this.files.get(file.path);
    if (!f || f.sha !== file.sha) throw new Error(`missing ${file.path}`);
    return f.text;
  }
  async write(files: { path: string; text: string }[]) {
    const out: Record<string, string> = {};
    for (const f of files) {
      const sha = await blobSha(f.text);
      this.files.set(f.path, { text: f.text, sha });
      out[f.path] = sha;
    }
    this.commits++;
    return out;
  }
}
