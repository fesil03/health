import { strFromU8, unzipSync } from 'fflate';
import { kindForFile, type SourceFile } from './parse';

/** Turns picked files (a Samsung export ZIP and/or loose CSVs) into text files we can parse. */
export async function readPickedFiles(files: File[]): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), {
        filter: (e) => kindForFile(e.name) !== null
      });
      for (const [path, bytes] of Object.entries(entries)) out.push({ path, text: strFromU8(bytes) });
    } else if (/\.csv$/i.test(f.name) && kindForFile(f.name)) {
      out.push({ path: f.name, text: await f.text() });
    }
  }
  return out;
}
