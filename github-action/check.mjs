/**
 * The PromptSpend price check: the pure part, with no file system or network.
 *
 * A project records the rates it was built against in a lockfile, the way a
 * package lockfile records versions. Each run compares that record with the
 * live catalog and fails when a rate a project depends on moved or a model it
 * calls was retired. Nothing is guessed: a model the catalog does not list is
 * reported as unknown, not priced.
 *
 * The rates compared are the ones in force today, so a promotion ending is a
 * change — it is one to the bill.
 */

/** The rates a bill depends on. Dotted paths read nested tiers. */
export const RATE_FIELDS = [
  'input',
  'output',
  'cachedInput',
  'cacheWrite',
  'batchDiscount',
  'longContext.thresholdTokens',
  'longContext.input',
  'longContext.output',
];

export const LOCK_COMMENT =
  'Written by the PromptSpend price check (github.com/AndrewAvery7/promptspend/tree/main/github-action). ' +
  'Commit it. The check fails when a rate recorded here moves or a model here is retired; ' +
  're-run with update: true to accept the new rates.';

/** A comma- or newline-separated input, trimmed, without blanks or duplicates. */
export function parseList(text) {
  return [
    ...new Set(
      String(text ?? '')
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

function at(value, path) {
  return path
    .split('.')
    .reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), value);
}

/** The pricing in force on `today` (YYYY-MM-DD): a promotion applies through its last named day. */
export function inForce(pricing, today) {
  const intro = pricing?.intro;
  if (!intro || !intro.until || today > intro.until) return pricing;
  return {
    ...pricing,
    input: intro.input,
    output: intro.output,
    ...(intro.cachedInput !== undefined ? { cachedInput: intro.cachedInput } : {}),
    ...(intro.cacheWrite !== undefined ? { cacheWrite: intro.cacheWrite } : {}),
  };
}

/** One model's lockfile record. */
export function record(model, today) {
  const pricing = inForce(model.pricing, today);
  const rates = {};
  for (const field of RATE_FIELDS) {
    const value = at(pricing, field);
    if (typeof value === 'number') rates[field] = value;
  }
  return {
    name: model.displayName,
    status: model.status,
    rates,
    source: model.provenance?.source ?? null,
    lastVerified: model.provenance?.lastVerified ?? null,
  };
}

/**
 * Model ids named in source text. Only quoted strings that are exactly a
 * catalog id count, so `"gpt-5"` matches and a comment saying "GPT-5 is
 * expensive" does not.
 */
export function findModelIds(text, ids) {
  const found = new Set();
  for (const match of String(text).matchAll(/["'`]([A-Za-z0-9][A-Za-z0-9._:/-]{1,120})["'`]/g)) {
    if (ids.has(match[1])) found.add(match[1]);
  }
  return found;
}

/**
 * Compare the lockfile with the live catalog.
 *
 * @param {object} args
 * @param {{ models?: Record<string, ReturnType<typeof record>> } | null} args.lock
 * @param {object[]} args.models  every model the catalog lists, aliases included
 * @param {string[]} args.watched model ids the project uses
 * @param {string[]} args.failOn  any of "change", "retired"
 * @param {string} args.today     YYYY-MM-DD
 */
export function evaluate({ lock, models, watched, failOn, today }) {
  const byId = new Map(models.map((m) => [m.id, m]));
  const rows = [];
  const failures = [];
  const warnings = [];
  const next = {};

  for (const id of [...watched].sort()) {
    const model = byId.get(id);
    if (!model) {
      warnings.push(`${id}: not in the PromptSpend catalog, so it is not checked.`);
      rows.push({ id, state: 'unknown' });
      continue;
    }
    // An alias routes to another model and is billed as that model.
    const billed = model.aliasOf ? (byId.get(model.aliasOf) ?? model) : model;
    const now = record(billed, today);
    next[id] = now;
    const before = lock?.models?.[id];
    const changes = [];
    if (before) {
      for (const field of new Set([...Object.keys(before.rates ?? {}), ...Object.keys(now.rates)])) {
        const from = before.rates?.[field];
        const to = now.rates[field];
        if (from !== to) changes.push({ field, from: from ?? null, to: to ?? null });
      }
    }

    let state = before ? (changes.length ? 'changed' : 'unchanged') : 'new';
    if (!before && lock) warnings.push(`${id}: not in the lockfile yet; run with update: true to record it.`);
    if (changes.length) {
      const text = changes.map((c) => `${c.field} ${c.from ?? 'none'} → ${c.to ?? 'none'}`).join(', ');
      (failOn.includes('change') ? failures : warnings).push(`${id}: price changed (${text}).`);
    }
    if (billed.status === 'deprecated') {
      state = 'retired';
      (failOn.includes('retired') ? failures : warnings).push(
        `${id}: retired by its vendor. Requests to it will fail; move to another model.`,
      );
    } else if (billed.status === 'legacy') {
      warnings.push(`${id}: marked legacy by its vendor; plan a replacement.`);
    }
    if (billed.provenance?.needsReview) warnings.push(`${id}: its price is disputed between sources.`);
    rows.push({ id, state, record: now, changes });
  }

  return { rows, failures, warnings, lock: { $comment: LOCK_COMMENT, models: next } };
}

function money(value) {
  return typeof value === 'number' ? `$${value}` : '—';
}

/** A Markdown table for the job summary. */
export function renderSummary(result, { lockfile, wrote }) {
  const lines = ['## PromptSpend price check', ''];
  if (wrote) lines.push(`Wrote \`${lockfile}\`. Commit it so the next run has something to compare.`, '');
  lines.push('| Model | Input / 1M | Output / 1M | Status | Result |', '| --- | --- | --- | --- | --- |');
  for (const row of result.rows) {
    if (row.state === 'unknown') {
      lines.push(`| \`${row.id}\` | — | — | — | not in catalog |`);
      continue;
    }
    const r = row.record;
    const detail =
      row.state === 'changed'
        ? row.changes.map((c) => `${c.field}: ${money(c.from)} → ${money(c.to)}`).join('<br>')
        : row.state;
    lines.push(
      `| \`${row.id}\` | ${money(r.rates.input)} | ${money(r.rates.output)} | ${r.status} | ${detail} |`,
    );
  }
  lines.push(
    '',
    'Rates are list prices in USD per million tokens, each with its source and last-confirmed date at ' +
      '[promptspend.com](https://promptspend.com/models/).',
  );
  return `${lines.join('\n')}\n`;
}
