import { describe, expect, it } from 'vitest';
import {
  isFreshShutdownReport,
  matchShutdowns,
  parseDate,
  readNotices,
  SHUTDOWN_CHECK_SCHEMA_VERSION,
  SOURCES,
  tables,
} from './shutdowns';

const [OPENAI, ANTHROPIC, GOOGLE] = SOURCES as [
  (typeof SOURCES)[number],
  (typeof SOURCES)[number],
  (typeof SOURCES)[number],
];

// Shaped like OpenAI's deprecations page on 2026-10-29: an escaped pipe inside
// the model cell, a substitute column that also holds backticked ids, both
// date spellings, and two header wordings.
const OPENAI_MD = `
### 2026-04-22: Legacy GPT model snapshots

| Shutdown date    | Model snapshot                          | Substitute model                      |
| ---------------- | --------------------------------------- | ------------------------------------- |
| October 23, 2026 | \`o1-2024-12-17\` \\| \`o1\`                | \`gpt-5.6-sol\`                       |
| October 23, 2026 | \`gpt-4o-2024-05-13\`                     | \`gpt-5.6-sol\`                       |

| Shutdown date | Model / system                        | Recommended replacement               |
| ------------- | ------------------------------------- | ------------------------------------- |
| Dec 11, 2026  | \`gpt-5-pro\` \\| \`gpt-5-pro-2025-10-06\` | \`gpt-5.6-sol\` (\`reasoning.mode: pro\`) |
`;

const ANTHROPIC_MD = `
| API model name             | Current state | Deprecated         | Tentative retirement date          |
| :------------------------- | :------------ | :----------------- | :--------------------------------- |
| claude-opus-5              | Active        | N/A                | Not sooner than July 24, 2027      |
| claude-opus-4-1-20250805   | Retired       | June 5, 2026       | August 5, 2026                     |
| claude-sonnet-4-5-20250929 | Deprecated    | September 30, 2026 | November 30, 2026                  |
`;

const GOOGLE_HTML = `
<table class="pricing-table"><tr><th>Model</th><th>Release date</th><th>Shutdown date</th><th>Recommended replacement</th></tr>
<tr><td><code>gemini-3.8-flash</code></td><td>September 2, 2026</td><td>No shutdown date announced</td><td></td></tr>
<tr><td>Preview models</td></tr>
<tr><td>gemini-3.1-flash-lite-preview</td><td>March 3, 2026</td><td>May 25, 2026</td><td>gemini-3.1-flash-lite</td></tr>
</table>`;

describe('the shut-down check', () => {
  it('reads only exact dates, in either spelling', () => {
    expect(parseDate('October 23, 2026')).toBe('2026-10-23');
    expect(parseDate('Dec 11, 2026')).toBe('2026-12-11');
    expect(parseDate('Sept. 1, 2026')).toBe('2026-09-01');
    expect(parseDate('Not sooner than July 24, 2027')).toBeNull();
    expect(parseDate('To be announced')).toBeNull();
    expect(parseDate('February 30, 2026')).toBeNull();
  });

  it('takes model names from the model column only, never the replacement column', () => {
    const notices = readNotices(OPENAI, OPENAI_MD);
    expect(notices.map((n) => n.name)).toEqual([
      'o1-2024-12-17',
      'o1',
      'gpt-4o-2024-05-13',
      'gpt-5-pro',
      'gpt-5-pro-2025-10-06',
    ]);
    expect(notices.find((n) => n.name === 'gpt-5-pro')?.date).toBe('2026-12-11');
  });

  it('reads HTML tables, restated headers and section rows included', () => {
    expect(tables(GOOGLE_HTML, 'html')[0]![0]).toEqual([
      'Model',
      'Release date',
      'Shutdown date',
      'Recommended replacement',
    ]);
    expect(readNotices(GOOGLE, GOOGLE_HTML)).toEqual([
      { name: 'gemini-3.1-flash-lite-preview', date: '2026-05-25', stateAllows: true },
    ]);
  });

  it('flags a shutdown that has passed and lists one still to come, matching each vendor its own way', () => {
    const models = [
      { id: 'o1', providerId: 'openai' },
      { id: 'gpt-4o', providerId: 'openai' }, // only a dated snapshot was shut down, not gpt-4o
      { id: 'gpt-5-pro', providerId: 'openai' },
      { id: 'claude-opus-4-1', providerId: 'anthropic' }, // matched through its dated snapshot
      { id: 'claude-sonnet-4-5', providerId: 'anthropic' },
      { id: 'claude-opus-5', providerId: 'anthropic' },
      { id: 'gemini-gemini-3.1-flash-lite-preview', providerId: 'google' },
      { id: 'gemini-gemini-3.8-flash', providerId: 'google' },
    ];
    const items = matchShutdowns({
      models,
      results: [
        { source: OPENAI, notices: readNotices(OPENAI, OPENAI_MD) },
        { source: ANTHROPIC, notices: readNotices(ANTHROPIC, ANTHROPIC_MD) },
        { source: GOOGLE, notices: readNotices(GOOGLE, GOOGLE_HTML) },
      ],
      today: '2026-10-29',
    });
    expect(items.map((i) => `${i.id} ${i.date} ${i.shutDown ? 'shut' : 'scheduled'}`)).toEqual([
      'claude-opus-4-1 2026-08-05 shut',
      'claude-sonnet-4-5 2026-11-30 scheduled',
      'gemini-gemini-3.1-flash-lite-preview 2026-05-25 shut',
      'gpt-5-pro 2026-12-11 scheduled',
      'o1 2026-10-23 shut',
    ]);
  });

  it('never calls a model shut down while its vendor still says it is active', () => {
    const notices = [{ name: 'claude-x', date: '2026-01-01', stateAllows: false }];
    const items = matchShutdowns({
      models: [{ id: 'claude-x', providerId: 'anthropic' }],
      results: [{ source: ANTHROPIC, notices }],
      today: '2026-10-29',
    });
    expect(items[0]!.shutDown).toBe(false);
  });

  it('trusts only this morning’s report', () => {
    const report = {
      schemaVersion: SHUTDOWN_CHECK_SCHEMA_VERSION,
      checkedAt: '2026-10-29T11:00:00Z',
      sources: [],
      items: [],
    };
    expect(isFreshShutdownReport(report, new Date('2026-10-29T12:00:00Z'))).toBe(true);
    expect(isFreshShutdownReport(report, new Date('2026-11-02T12:00:00Z'))).toBe(false);
    expect(isFreshShutdownReport(undefined, new Date())).toBe(false);
  });
});
