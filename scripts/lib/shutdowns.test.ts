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

const [OPENAI, ANTHROPIC, GOOGLE, COHERE, MISTRAL] = SOURCES as [
  (typeof SOURCES)[number],
  (typeof SOURCES)[number],
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

// Mistral renders its header and its rows as two separate tables, writes US
// dates, and puts deprecation and retirement in one cell.
const MISTRAL_HTML = `
<table><thead><tr><th>Model</th><th>Version</th><th>API</th><th>Deprecation Retirement</th><th>Alternative</th></tr></thead></table>
<table><tbody>
<tr><td>Z.ai GLM 5.2 ↗</td><td>5.2</td><td>zai-glm-5-2</td><td>9/29/2026 10/31/2026</td><td>Z.ai GLM 5.3</td></tr>
<tr><td>Mistral Medium 3 ↗</td><td>25.05</td><td>mistral-medium-2505</td><td>5/22/2026 8/31/2026</td><td>Mistral Medium 3.5</td></tr>
<tr><td>Codestral ↗</td><td>25.01</td><td>codestral-2501</td><td>11/6/2025 11/30/2025</td><td>Codestral</td></tr>
<tr><td>Codestral ↗</td><td>24.05</td><td>codestral-2405</td><td>12/2/2024 6/16/2025</td><td>Codestral</td></tr>
<tr><td>Mistral Next ↗</td><td></td><td></td><td></td><td>Mistral Large 3</td></tr>
</tbody></table>`;

const COHERE_MD = `
| Shutdown Date | Deprecated Model | Deprecated Model Price | Recommended Replacement |
| ------------- | ---------------- | ---------------------- | ----------------------- |
| 2025-04-30 | \`rerank-english-v2.0\` | \\$1.00 / 1K searches | \`rerank-v3.5\` |
`;

describe('the shut-down check, beyond the first three vendors', () => {
  it('reads ISO and US dates, and the last of several in one cell', () => {
    expect(parseDate('2025-04-30')).toBe('2025-04-30');
    expect(parseDate('8/31/2026')).toBe('2026-08-31');
    expect(parseDate('13/1/2026')).toBeNull();
    expect(readNotices(COHERE, COHERE_MD)).toEqual([
      { name: 'rerank-english-v2.0', date: '2025-04-30', stateAllows: true },
    ]);
  });

  it('carries a header-only table onto the rows that follow it, and skips rows with no date', () => {
    const notices = readNotices(MISTRAL, MISTRAL_HTML);
    expect(notices.map((n) => `${n.name}|${n.version}|${n.date}`)).toEqual([
      'Z.ai GLM 5.2|5.2|2026-10-31',
      'Mistral Medium 3|25.05|2026-08-31',
      'Codestral|25.01|2025-11-30',
      'Codestral|24.05|2025-06-16',
    ]);
  });

  it('matches Mistral by display name, and a repeated name only with its version', () => {
    const items = matchShutdowns({
      models: [
        { id: 'mistral-mistral-medium-3', providerId: 'mistral', displayName: 'Mistral Medium 3' },
        { id: 'mistral-codestral-2508', providerId: 'mistral', displayName: 'Codestral 25.08' },
        { id: 'mistral-codestral-2501', providerId: 'mistral', displayName: 'Codestral 25.01' },
        // Mistral's hosted copy of another lab's model is not that lab's model.
        { id: 'zai-glm-5.2', providerId: 'zai', displayName: 'Z.ai GLM 5.2' },
      ],
      results: [{ source: MISTRAL, notices: readNotices(MISTRAL, MISTRAL_HTML) }],
      today: '2026-10-29',
    });
    expect(items.map((i) => `${i.id} ${i.vendorName} ${i.shutDown ? 'shut' : 'scheduled'}`)).toEqual([
      'mistral-codestral-2501 Codestral (25.01) shut',
      'mistral-mistral-medium-3 Mistral Medium 3 (25.05) shut',
    ]);
  });
});
