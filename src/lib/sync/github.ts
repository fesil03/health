import type { RemoteFile, RemoteStore } from './store';

export interface GitHubConfig {
  owner: string;
  repo: string;
  token: string;
}

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

const toB64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64: string) => {
  const s = atob(b64.replace(/\n/g, ''));
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

/** Talks to the private data repo through GitHub's REST API. */
export class GitHubStore implements RemoteStore {
  private branch: string | null = null;
  constructor(
    private cfg: GitHubConfig,
    private fetchFn: typeof fetch = (...a) => fetch(...a)
  ) {}

  private async api<T>(path: string, init: RequestInit = {}, okMissing = false): Promise<T | null> {
    const res = await this.fetchFn(`https://api.github.com/repos/${this.cfg.owner}/${this.cfg.repo}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.cfg.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {})
      }
    });
    if (okMissing && (res.status === 404 || res.status === 409)) return null;
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = ((await res.json()) as { message?: string }).message ?? msg;
      } catch {
        /* keep statusText */
      }
      throw new GitHubError(res.status, `GitHub ${res.status}: ${msg}`);
    }
    return (await res.json()) as T;
  }

  /** Checks the token can reach the repo. */
  async check(): Promise<void> {
    const info = await this.api<{ default_branch: string; private: boolean }>('');
    this.branch = info!.default_branch;
    if (!info!.private) throw new Error('The data repo must be private.');
  }

  private async defaultBranch(): Promise<string> {
    if (!this.branch) await this.check();
    return this.branch!;
  }

  private async head(): Promise<string | null> {
    const ref = await this.api<{ object: { sha: string } }>(`/git/ref/heads/${await this.defaultBranch()}`, {}, true);
    return ref?.object.sha ?? null;
  }

  async list(): Promise<RemoteFile[]> {
    const head = await this.head();
    if (!head) return [];
    const tree = await this.api<{ tree: { path: string; sha: string; type: string }[]; truncated: boolean }>(
      `/git/trees/${head}?recursive=1`
    );
    return tree!.tree.filter((t) => t.type === 'blob').map((t) => ({ path: t.path, sha: t.sha }));
  }

  async read(file: RemoteFile): Promise<string> {
    const blob = await this.api<{ content: string; encoding: string }>(`/git/blobs/${file.sha}`);
    return blob!.encoding === 'base64' ? fromB64(blob!.content) : blob!.content;
  }

  async write(files: { path: string; text: string }[], message: string): Promise<Record<string, string>> {
    const branch = await this.defaultBranch();
    let head = await this.head();
    if (!head) {
      // Empty repo: the contents API is the only way to make the first commit.
      const out: Record<string, string> = {};
      for (const f of files) {
        const res = await this.api<{ content: { sha: string } }>(`/contents/${f.path}`, {
          method: 'PUT',
          body: JSON.stringify({ message, content: toB64(f.text), branch })
        });
        out[f.path] = res!.content.sha;
      }
      return out;
    }
    const out: Record<string, string> = {};
    const entries = [];
    for (const f of files) {
      const blob = await this.api<{ sha: string }>('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: f.text, encoding: 'utf-8' })
      });
      out[f.path] = blob!.sha;
      entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob!.sha });
    }
    // One commit for the whole sync. Retry if another device pushed in between.
    for (let attempt = 0; attempt < 3; attempt++) {
      const commit = await this.api<{ tree: { sha: string } }>(`/git/commits/${head}`);
      const tree = await this.api<{ sha: string }>('/git/trees', {
        method: 'POST',
        body: JSON.stringify({ base_tree: commit!.tree.sha, tree: entries })
      });
      const next = await this.api<{ sha: string }>('/git/commits', {
        method: 'POST',
        body: JSON.stringify({ message, tree: tree!.sha, parents: [head] })
      });
      try {
        await this.api(`/git/refs/heads/${branch}`, { method: 'PATCH', body: JSON.stringify({ sha: next!.sha }) });
        return out;
      } catch (e) {
        if (!(e instanceof GitHubError) || e.status !== 422) throw e;
        head = await this.head();
      }
    }
    throw new Error('Could not update the data repo after 3 tries. Sync again.');
  }
}
