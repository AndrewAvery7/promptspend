export interface LearnModule {
  id: string;
  number: string;
  title: string;
  teaser: string;
  minutes: number;
  kind: string;
  /** Paragraphs, revealed when the card is expanded. */
  body: string[];
}

/**
 * The tutorial layer. Deliberately short: each module is one idea, the number
 * that proves it, and what to do about it.
 */
export const LEARN_MODULES: LearnModule[] = [
  {
    id: 'tokens-101',
    number: '01',
    title: 'Tokens 101',
    teaser:
      'What a token actually is, why ~750 English words ≈ 1,000 tokens, and why code and Chinese text break the rule.',
    minutes: 3,
    kind: 'interactive',
    body: [
      'Models do not read characters or words. They read tokens: chunks of text a tokenizer has learned to treat as single units. Common English words are usually one token; rarer words split into several.',
      'The rule of thumb everyone quotes — roughly four characters, or about 0.75 words, per token — holds for ordinary English prose and nothing else. Source code, with its punctuation and identifiers, runs closer to three characters per token. Chinese and Japanese are the extreme case: often one or two characters per token, so the same paragraph can cost twice as much to send.',
      'That matters the moment you serve a non-English audience. A support bot whose prompts are identical in English and Chinese does not have an identical bill.',
    ],
  },
  {
    id: 'output-costs-more',
    number: '02',
    title: 'Output costs more. A lot more.',
    teaser:
      'Output runs three to five times the input price on most models. Verbose responses, not long prompts, are what blow up bills.',
    minutes: 3,
    kind: 'interactive',
    body: [
      'Almost every provider charges more for tokens the model writes than for tokens you send. Three to five times more is typical, and on some frontier models the gap is wider still.',
      'The practical consequence is counter-intuitive: trimming a long system prompt often saves less than asking for a shorter answer. Cutting a 900-token response to 400 tokens usually beats cutting an 800-token system prompt to 300 — and the system prompt can be cached, while the response cannot.',
      'Watch the split bar on any cost card. If output dominates it, your cheapest optimisation is a instruction to be concise, or a max-tokens ceiling.',
    ],
  },
  {
    id: 'price-spread',
    number: '03',
    title: 'The price spread is enormous',
    teaser:
      'Frontier output can cost hundreds of times the cheapest capable model. When is each worth it? A framework, not a dogma.',
    minutes: 5,
    kind: 'value map',
    body: [
      'The catalog on this site spans roughly two orders of magnitude between the cheapest input rate and the priciest output rate. No other line item in a software budget has that range.',
      'The trap is treating that as a simple "use the cheap one" instruction. Frontier models earn their price on genuinely hard work — long autonomous tasks, subtle reasoning, code that has to be right the first time. Budget models are astonishing at classification, extraction, summarisation and routing.',
      'The useful move is routing: send the easy majority of traffic to a cheap model and escalate only what needs it. Model the two tiers separately here, then blend them by your expected split.',
    ],
  },
  {
    id: 'history-compounds',
    number: '04',
    title: 'Chat history compounds',
    teaser:
      'Turn 20 re-sends turns 1 through 19 as input. Watch a fraction-of-a-cent request become a several-cent request inside one session.',
    minutes: 4,
    kind: 'interactive',
    body: [
      'The API is stateless. To continue a conversation you resend everything that came before, so the input side of turn N carries the whole transcript up to that point.',
      'Total input across a conversation therefore grows with the square of the turn count, not linearly. Doubling the number of turns roughly quadruples the input tokens. Raise the turn slider on the Estimate tab and watch the curve.',
      'Two defences: prompt caching, which makes the repeated prefix roughly ten times cheaper, and summarising older turns instead of resending them verbatim.',
    ],
  },
  {
    id: 'reasoning-tokens',
    number: '05',
    title: 'Reasoning models bill their thinking',
    teaser:
      'Thinking modes generate hidden reasoning tokens, billed as output. The visible answer is not what you pay for.',
    minutes: 4,
    kind: 'example',
    body: [
      'Models with extended thinking produce reasoning tokens before the answer. You are usually billed for them at the output rate, and you usually never see them.',
      'A 200-token answer can therefore arrive with several thousand billed output tokens behind it. Estimates built only on visible response length can understate the real cost by a wide margin.',
      'The reasoning multiplier under Advanced assumptions on the Estimate tab exists for exactly this. Set it from your own measured usage — providers report the reasoning token count in their usage fields.',
    ],
  },
  {
    id: 'caching-and-batching',
    number: '06',
    title: 'Caching and batching: the discounts nobody uses',
    teaser:
      'Prompt caching cuts repeated input by roughly 90%. Batch APIs take about 50% off everything that tolerates delay.',
    minutes: 5,
    kind: 'calculator',
    body: [
      'Prompt caching stores the unchanging prefix of your request — the system prompt, the tool definitions, the retrieved documents — so subsequent calls pay a fraction of the input rate for it. For a chat product with a stable system prompt, that is close to free money.',
      'Caching is a prefix match, which is the part people get wrong: any byte that changes early in the prompt invalidates everything after it. A timestamp at the top of a system prompt can silently disable caching entirely.',
      'Batch APIs are the other underused discount: submit work asynchronously, get results within hours, pay about half. Anything not in front of a waiting user is a candidate.',
    ],
  },
  {
    id: 'never-stale',
    number: '07',
    title: 'How this site never goes stale',
    teaser:
      'The daily pipeline behind every price: two independent sources, sanity checks, a public changelog. Steal the pattern.',
    minutes: 4,
    kind: 'architecture',
    body: [
      'Every morning a GitHub Action fetches a community pricing catalog and an independent second source, filters both through a family-level allowlist, and merges them under a fixed trust order: hand-verified vendor rates beat the automated feed, which beats nothing at all.',
      'Sanity rules then decide what happens next. A clean diff is committed and deployed automatically. A price that moved more than half in one day, or where the two sources disagree by more than a fifth, is raised as a pull request for a human instead.',
      'Because the capture patterns are family-level rather than a fixed list, a brand-new model version is picked up by the next run without anyone touching code — which is exactly the failure this project was built to avoid.',
    ],
  },
];
