/**
 * The token counter's script: the optional half of `/token-counter/`.
 *
 * The page is drawn at build time with the explanation, the model list and
 * every model's rate already in it. This file adds the counting. It runs
 * entirely in the visitor's browser: it makes no request that carries the
 * text, writes nothing to storage and puts nothing in the address bar. The
 * only thing it ever fetches is the tokenizer's own file, from this site, the
 * first time an OpenAI-family model needs it.
 *
 * Everything it needs about a model travels on `data-` attributes written by
 * `renderTokenCounterPage()` in `src/lib/seo/render.ts`.
 */
import { formatMoney } from '@/lib/engine/format';
import type { Model, TokenizerSpec } from '@/lib/pricing/types';
import { countTokens, estimateForModel, type TokenCount } from '@/lib/tokenize';

/** How many characters, words and lines a piece of text has. */
export function textStats(text: string): { characters: number; words: number; lines: number } {
  const trimmed = text.trim();
  return {
    characters: [...text].length,
    words: trimmed === '' ? 0 : trimmed.split(/\s+/).length,
    lines: text === '' ? 0 : text.split('\n').length,
  };
}

/** The input cost of `tokens` at `perMillion` dollars per 1M tokens. */
export function inputCost(tokens: number, perMillion: number): number {
  return (tokens / 1_000_000) * perMillion;
}

/** How much of a context window the text fills, as a short string. */
export function contextShare(tokens: number, contextWindow: number): string {
  if (tokens === 0 || contextWindow <= 0) return '0%';
  const share = (tokens / contextWindow) * 100;
  if (share < 0.1) return '<0.1%';
  return `${share >= 10 ? share.toFixed(0) : share.toFixed(1)}%`;
}

/** The tokenizer a row or option describes, read back from its attributes. */
export function tokenizerOf(el: HTMLElement): TokenizerSpec {
  const tk = el.dataset.tk;
  if (tk === 'o200k_base' || tk === 'cl100k_base') return { kind: 'tiktoken', encoding: tk };
  return {
    kind: 'approx',
    charsPerToken: Number(el.dataset.cpt) || 3.8,
    cjkCharsPerToken: Number(el.dataset.cjk) || 1.5,
    ...(el.dataset.note ? { note: el.dataset.note } : {}),
  };
}

/** Rows and options that share a tokenizer share one count. */
function tokenizerKey(el: HTMLElement): string {
  return el.dataset.tk === 'approx' ? `approx:${el.dataset.cpt}:${el.dataset.cjk}` : (el.dataset.tk ?? '');
}

const asModel = (el: HTMLElement): Model => ({ tokenizer: tokenizerOf(el) }) as unknown as Model;

export function initTokenCounter(doc: Document = document): void {
  const text = doc.getElementById('tc-text') as HTMLTextAreaElement | null;
  const select = doc.getElementById('tc-model') as HTMLSelectElement | null;
  if (!text || !select) return;
  doc.getElementById('tc-needs-js')?.remove();

  const out = (id: string): HTMLElement => doc.getElementById(id) as HTMLElement;
  const rows = [...doc.querySelectorAll<HTMLElement>('tr[data-tk]')];
  let latest = 0;

  const show = (el: HTMLElement | null, value: string): void => {
    if (el) el.textContent = value;
  };

  function renderSelected(count: TokenCount): void {
    const option = select!.selectedOptions[0];
    if (!option) return;
    const perMillion = Number(option.dataset.input);
    show(out('tc-tokens'), count.tokens.toLocaleString('en-US'));
    show(out('tc-method'), count.method === 'exact' ? 'Exact' : 'Estimate');
    show(out('tc-cost'), formatMoney(inputCost(count.tokens, perMillion)));
    show(out('tc-context'), contextShare(count.tokens, Number(option.dataset.context)));
    show(out('tc-note'), count.note);
  }

  async function update(): Promise<void> {
    const run = ++latest;
    const value = text!.value;
    const stats = textStats(value);
    show(out('tc-chars'), stats.characters.toLocaleString('en-US'));
    show(out('tc-words'), stats.words.toLocaleString('en-US'));
    show(out('tc-lines'), stats.lines.toLocaleString('en-US'));

    const option = select!.selectedOptions[0];
    if (option) renderSelected(estimateForModel(value, asModel(option)));

    // One count per distinct tokenizer, then every row that shares it.
    const counts = new Map<string, TokenCount>();
    const keys = new Map<string, HTMLElement>();
    for (const el of option ? [option, ...rows] : rows) {
      const key = tokenizerKey(el);
      if (!keys.has(key)) keys.set(key, el);
    }
    for (const [key, el] of keys) {
      const count = await countTokens(value, asModel(el));
      if (run !== latest) return;
      counts.set(key, count);
    }
    if (run !== latest) return;

    if (option) renderSelected(counts.get(tokenizerKey(option))!);
    for (const row of rows) {
      const count = counts.get(tokenizerKey(row))!;
      show(row.querySelector('.tc-row-tokens'), count.tokens.toLocaleString('en-US'));
      show(row.querySelector('.tc-row-method'), count.method === 'exact' ? 'Exact' : 'Estimate');
      show(
        row.querySelector('.tc-row-cost'),
        formatMoney(inputCost(count.tokens, Number(row.dataset.input))),
      );
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  text.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => void update(), 150);
  });
  select.addEventListener('change', () => void update());
  void update();
}

if (typeof document !== 'undefined') initTokenCounter();
