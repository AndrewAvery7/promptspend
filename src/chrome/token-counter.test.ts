import { afterEach, describe, expect, it } from 'vitest';
import { contextShare, initTokenCounter, inputCost, textStats, tokenizerOf } from './token-counter';

describe('textStats', () => {
  it('counts characters, words and lines', () => {
    expect(textStats('')).toEqual({ characters: 0, words: 0, lines: 0 });
    expect(textStats('  one two\nthree  ')).toEqual({ characters: 17, words: 3, lines: 2 });
  });

  it('counts a character once however many code units it takes', () => {
    expect(textStats('a😀b').characters).toBe(3);
  });
});

describe('inputCost and contextShare', () => {
  it('prices tokens at dollars per million', () => {
    expect(inputCost(1_000_000, 2.5)).toBeCloseTo(2.5, 10);
    expect(inputCost(2_000, 3)).toBeCloseTo(0.006, 10);
    expect(inputCost(0, 3)).toBe(0);
  });

  it('shows how much of a context window is used, without false precision', () => {
    expect(contextShare(0, 400_000)).toBe('0%');
    expect(contextShare(10, 400_000)).toBe('<0.1%');
    expect(contextShare(4_000, 400_000)).toBe('1.0%');
    expect(contextShare(200_000, 400_000)).toBe('50%');
  });
});

describe('tokenizerOf', () => {
  it('rebuilds a tiktoken spec or a calibrated estimate from the attributes', () => {
    const a = document.createElement('option');
    a.dataset.tk = 'o200k_base';
    expect(tokenizerOf(a)).toEqual({ kind: 'tiktoken', encoding: 'o200k_base' });
    const b = document.createElement('tr');
    Object.assign(b.dataset, { tk: 'approx', cpt: '3.2', cjk: '1.1', note: 'Claude' });
    expect(tokenizerOf(b)).toEqual({
      kind: 'approx',
      charsPerToken: 3.2,
      cjkCharsPerToken: 1.1,
      note: 'Claude',
    });
  });
});

function page(): void {
  document.body.innerHTML = `
    <textarea id="tc-text"></textarea>
    <p id="tc-needs-js">needs js</p>
    <select id="tc-model">
      <option value="a" data-input="2" data-context="1000" data-tk="approx" data-cpt="4" data-cjk="1.5" selected>A</option>
      <option value="b" data-input="10" data-context="1000" data-tk="approx" data-cpt="2" data-cjk="1.5">B</option>
    </select>
    <span id="tc-tokens"></span><span id="tc-method"></span><span id="tc-cost"></span><span id="tc-context"></span>
    <span id="tc-chars"></span><span id="tc-words"></span><span id="tc-lines"></span><p id="tc-note"></p>
    <table><tbody>
      <tr data-input="2" data-tk="approx" data-cpt="4" data-cjk="1.5"><td class="tc-row-tokens"></td><td class="tc-row-method"></td><td class="tc-row-cost"></td></tr>
      <tr data-input="10" data-tk="approx" data-cpt="2" data-cjk="1.5"><td class="tc-row-tokens"></td><td class="tc-row-method"></td><td class="tc-row-cost"></td></tr>
    </tbody></table>`;
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 400));

describe('initTokenCounter', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does nothing on a page without the counter', () => {
    document.body.innerHTML = '<p>nothing</p>';
    expect(() => initTokenCounter(document)).not.toThrow();
  });

  it('removes the needs-JavaScript note and counts as text is typed', async () => {
    page();
    initTokenCounter(document);
    expect(document.getElementById('tc-needs-js')).toBeNull();

    const text = document.getElementById('tc-text') as HTMLTextAreaElement;
    text.value = 'x'.repeat(400);
    text.dispatchEvent(new Event('input'));
    await settle();

    expect(document.getElementById('tc-chars')!.textContent).toBe('400');
    expect(document.getElementById('tc-words')!.textContent).toBe('1');
    expect(document.getElementById('tc-tokens')!.textContent).toBe('100');
    expect(document.getElementById('tc-method')!.textContent).toBe('Estimate');
    const rows = [...document.querySelectorAll('tbody tr')];
    expect(rows.map((r) => r.querySelector('.tc-row-tokens')!.textContent)).toEqual(['100', '200']);
    expect(rows.map((r) => r.querySelector('.tc-row-method')!.textContent)).toEqual(['Estimate', 'Estimate']);
  });

  it('prices the text at the chosen model and follows a change of model', async () => {
    page();
    initTokenCounter(document);
    const text = document.getElementById('tc-text') as HTMLTextAreaElement;
    text.value = 'y'.repeat(4_000);
    text.dispatchEvent(new Event('input'));
    await settle();
    // 1,000 tokens at $2 per 1M = $0.002; and 100% of a 1,000-token window.
    expect(document.getElementById('tc-cost')!.textContent).toBe('$0.0020');
    expect(document.getElementById('tc-context')!.textContent).toBe('100%');

    const select = document.getElementById('tc-model') as HTMLSelectElement;
    select.value = 'b';
    select.dispatchEvent(new Event('change'));
    await settle();
    // 2,000 tokens at $10 per 1M = $0.02.
    expect(document.getElementById('tc-tokens')!.textContent).toBe('2,000');
    expect(document.getElementById('tc-cost')!.textContent).toBe('$0.020');
  });

  it('sends nothing anywhere and stores nothing', async () => {
    page();
    const requests: unknown[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((...args: unknown[]) => {
      requests.push(args);
      return Promise.reject(new Error('no network in this test'));
    }) as typeof fetch;
    try {
      initTokenCounter(document);
      const text = document.getElementById('tc-text') as HTMLTextAreaElement;
      text.value = 'a private sentence';
      text.dispatchEvent(new Event('input'));
      await settle();
      expect(requests).toEqual([]);
      expect(localStorage.length + sessionStorage.length).toBe(0);
      expect(document.cookie).toBe('');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
