/**
 * The data behind `/token-counter/`: the models the counter offers, with what
 * it needs to count and price a piece of text for each.
 *
 * Built from the same page set as the model pages, so the rates are the ones in
 * force on the build date, promotions applied, and a model the catalog has
 * retired is not offered. The counting itself happens in the visitor's browser
 * (`src/chrome/token-counter.ts`); nothing here ever sees anyone's text.
 */
import type { TokenizerSpec } from '../pricing/types';
import type { PageSet } from './pages';

export interface CounterModel {
  id: string;
  name: string;
  providerName: string;
  /** USD per 1M input tokens, in force on the build date. */
  input: number;
  contextWindow: number;
  tokenizer: TokenizerSpec;
  /** The model's own page, for the link in the table. */
  path: string;
}

export interface TokenCounterInput {
  models: CounterModel[];
}

export function tokenCounterInput(set: PageSet): TokenCounterInput {
  const models = set.models
    .filter((page) => page.model.status !== 'deprecated')
    .map((page) => ({
      id: page.model.id,
      name: page.model.displayName,
      providerName: page.providerName,
      input: page.effective.input,
      contextWindow: page.model.contextWindow,
      tokenizer: page.model.tokenizer,
      path: page.path,
    }))
    .sort((a, b) => a.providerName.localeCompare(b.providerName) || a.name.localeCompare(b.name));
  return { models };
}

/** The attributes the browser script reads to rebuild a model's tokenizer. */
export function tokenizerAttributes(spec: TokenizerSpec): Record<string, string> {
  return spec.kind === 'tiktoken'
    ? { 'data-tk': spec.encoding }
    : {
        'data-tk': 'approx',
        'data-cpt': String(spec.charsPerToken),
        'data-cjk': String(spec.cjkCharsPerToken),
        ...(spec.note ? { 'data-note': spec.note } : {}),
      };
}
