// Small RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF, BOM.

export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

/** Rows as objects keyed by header. Samsung prefixes like
 * `com.samsung.health.heart_rate.start_time` are reduced to `start_time`. */
export function toObjects(rows: string[][]): Record<string, string>[] {
  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map((h) => h.trim().replace(/^com\.samsung\.health\.[a-z_]+\./, ''));
  return body.map((r) => {
    const o: Record<string, string> = {};
    keys.forEach((k, i) => {
      if (k && (o[k] === undefined || o[k] === '')) o[k] = (r[i] ?? '').trim();
    });
    return o;
  });
}
