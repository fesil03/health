import { useState } from 'react';
import { db } from '../lib/db';
import { buildClaudeSummary } from '../lib/forClaude';
import { loadPresets } from '../lib/presets';
import { addDays, todayLocal } from '../lib/time';
import { Chip } from './kit';

const RANGES = [
  { days: 1, label: 'Today' },
  { days: 3, label: '3 days' },
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' }
];

async function build(days: number, question: string) {
  const to = todayLocal();
  return buildClaudeSummary(db, await loadPresets(db), { from: addDays(to, -(days - 1)), to, question });
}

/** Copies a readable summary of the last few days, to paste into a chat with Claude. */
export function AskClaude() {
  const [days, setDays] = useState(3);
  const [question, setQuestion] = useState('');
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function copy() {
    setStatus('Preparing…');
    const pending = build(days, question);
    let copied = false;
    try {
      // Safari only allows clipboard writes inside the tap itself, so hand it a promise
      // instead of awaiting the summary first.
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/plain': pending.then((t) => new Blob([t], { type: 'text/plain' })) })
        ]);
        copied = true;
      }
    } catch {
      /* fall through */
    }
    const t = await pending;
    if (!copied) {
      try {
        await navigator.clipboard.writeText(t);
        copied = true;
      } catch {
        /* shown below for manual copying */
      }
    }
    setText(t);
    setStatus(
      copied
        ? `Copied ${days === 1 ? 'today' : `the last ${days} days`}. Paste it into Claude.`
        : "Couldn't copy automatically. Select the text below and copy it."
    );
  }

  return (
    <section className="section" aria-label="Ask Claude">
      <h2 className="h2">Ask Claude about it</h2>
      <p className="mb-3 text-sm text-steel">
        Copies a short summary of your log (meals, coffee, supplements, symptoms, stool, sleep, heart rate) to paste into a chat. Nothing is sent
        anywhere unless you paste it.
      </p>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="How many days">
        {RANGES.map((r) => (
          <Chip key={r.days} active={days === r.days} onClick={() => setDays(r.days)}>
            {r.label}
          </Chip>
        ))}
      </div>
      <label className="mb-3 block">
        <span className="label">Your question (optional)</span>
        <input
          className="input"
          value={question}
          placeholder="e.g. Why did I burp so much after lunch?"
          onChange={(e) => setQuestion(e.target.value)}
        />
      </label>
      <button className="btn w-full" onClick={() => void copy()}>
        Copy for Claude
      </button>
      {status && (
        <p className="mt-2 text-sm text-ink" aria-live="polite">
          {status}
        </p>
      )}
      {text && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-steel">See what was copied</summary>
          <textarea
            className="input mt-2 h-56 font-mono text-xs"
            readOnly
            value={text}
            data-testid="claude-text"
            onFocus={(e) => e.currentTarget.select()}
          />
        </details>
      )}
    </section>
  );
}
