---
slug: what-llm-cost-calculators-get-wrong
title: What LLM Cost Calculators Get Wrong
description: Nine specific ways LLM cost calculators get the number wrong, one story about getting it wrong on our own product, and how to catch either.
published: 2026-08-12
---

Is the number these calculators show you actually right? Not whether the
model is in the catalog — whether the arithmetic behind that number matches
what a provider will actually bill. Below are nine specific ways it usually
doesn't, one story about how a wrong-but-plausible number hid from the
people who built the tool, and what it takes to catch either failure before
a reader does.

Every figure below carries a source and a date, the same way the underlying
catalog does. Don't take our word for it — the same provenance is one
request away:

```bash
curl -s https://promptspend.dev/v1/models/gpt-5
```

The response carries `provenance.source`, `provenance.lastVerified`, and
`provenance.verifiedUrl` on every model. If a number in this article and the
number that endpoint returns ever disagree, the endpoint is right — this
article just goes stale first.

## 1. Output is priced separately

Every major provider charges more for what a model writes than for what you
send it. Generation is the expensive part, not comprehension. Claude Sonnet
4.6 bills input at $3 and output at $15 per million tokens (Anthropic,
verified 2026-08-03) — output costs five times input, not some blended
average of the two. A calculator that reports one "per-token" figure for a
model is wrong before you've typed a prompt: it's picking one side of a 5x
gap and hoping your workload matches it.

## 2. Chat history compounds

A multi-turn conversation doesn't cost turn-count times one-turn-cost.
Every provider requires the full conversation to be resent as input on each
turn, because none of them hold state for you between requests. Take a
support exchange running 200 tokens per turn: a flat estimate for ten turns
says 2,000 tokens. What actually gets billed — because turn N resends
turns 1 through N-1 in full — is 9,000 tokens of resent history before a
single new word of turn ten is counted. That's more than 4x the flat
estimate, and it's before adding what each turn actually contributes. The
shape is quadratic in turn count. A ten-message support chat and a
ninety-message one don't scale the same way, and a calculator that
multiplies instead of summing gets more wrong the longer the conversation
runs.

## 3. Tokenizers differ per family

"How many tokens is this prompt" doesn't have one answer across vendors,
because it isn't one algorithm. OpenAI-family models use a published,
runnable tokenizer (`o200k_base`), so an exact count is possible
client-side. Anthropic doesn't ship a public tokenizer at all — counting
happens server-side — so anything outside OpenAI's family is necessarily a
calibrated estimate: roughly 3.6 characters per token for English prose, 1.5
for CJK text, tuned against real samples rather than the model's own code.
A calculator that applies one ratio to every model it lists is applying an
OpenAI-shaped assumption to providers that never agreed to it, and it won't
say which of its numbers are exact and which are guesses, because it isn't
tracking the difference itself.

## 4. Caching is not free

"Prompt caching" sounds like a discount with no downside. The read side is:
cached input on GPT-5.6 Terra runs $0.20 per million against a $2 standard
rate, a 10x saving. The write side is where that framing falls apart. The
first time a prefix enters the cache, both OpenAI and Anthropic charge
more than the standard input rate to store it — 1.25x across every model
we've checked, from Claude Haiku 4.5 ($1.25 cache-write against a $1 input
rate, Anthropic, verified 2026-08-01) to GPT-5.6 Terra ($2.50 against $2,
OpenAI, verified 2026-08-01). A calculator that only ever shows you the 10x
read discount is showing you the number that makes the feature look best,
not the number your first request of the day will actually cost.

## 5. Long context costs more

Cross a provider's context threshold and the entire request reprices, not
just the tokens past the line. OpenAI's GPT-5.4 bills $2.50 input / $15
output per million tokens under 272,000 input tokens, and $5 / $22.50 — 2x
input, 1.5x output — the instant a request crosses that line (OpenAI,
verified 2026-08-03). That threshold applies per request, which means a
conversation can start under the tier and cross it mid-thread as history
accumulates: the same chat that priced cheaply on turn three can silently
double its input rate by turn twelve, and a calculator that quotes one flat
rate per model has no way to tell you when that happens.

## 6. Reasoning tokens are billable

What you see as "the answer" and what you're billed for are not the same
text. Reasoning models like OpenAI's o3 (billed at $2 input / $8 output per
million tokens, OpenAI, verified 2026-08-03) generate hidden thinking tokens
before the visible response, and those tokens are billed as output whether
or not you ever see them. A calculator that counts only the words on screen
is pricing a request that doesn't exist — the invoice includes tokens the
interface never showed you, and the gap between "visible answer" and
"billed output" is exactly the part a screenshot can't reveal.

## 7. Promotional pricing expires

Introductory rates are real, and they're also temporary. A calculator that
hard-codes them stops being honest the day the window closes. As of this
writing, Claude Sonnet 5 is priced at $2 input / $10 output through
2026-08-31 (Anthropic, verified 2026-08-01) — the standard rate that takes
over the day after is $3 / $15. An estimate built today and still quoted in
September is quoting a rate that no longer exists, unless the tool doing the
estimating knows the window has a date and checks it against the date it's
actually being asked. Most don't carry a date at all; they carry the number
that was true when someone last edited the page.

## 8. Assumptions are visible

Every calculator makes assumptions the provider hasn't published: what share
of a conversation is a cache hit, how large the hidden reasoning share
usually runs, whether the batch API is in play. Those assumptions decide the
number on screen as much as the published rates do. The difference is
whether they're printed next to the answer or buried in a methodology page
nobody reads — a promotional rate in effect, a reasoning multiplier applied,
a batch discount assumed, each stated in plain language under the total
rather than folded silently into it. A number with its assumptions attached
can be argued with. A number without them can only be believed or not.

## 9. Impossible scenarios are named

GPT-5 has a 272,000-token context window and a 128,000-token output ceiling
(OpenAI, verified 2026-08-03). Paste a 300,000-token document in and the
request can't be sent at all — it's 28,000 tokens over the line before
generation even starts. A calculator that just multiplies token count by
rate will return a confident dollar figure for a request the API would
reject outright, because multiplication doesn't know the difference between
an expensive request and an impossible one. The honest answer to "what would
this cost" is sometimes "nothing, because it can't happen" — and that answer
requires checking the ceiling, not just the rate.

## The proof nobody asked for

Everything above is a claim about pricing engines in the abstract. Here's
what it looked like to get one wrong in public, because we did, twice, on
our own product.

Building an editor extension that prices the model on the line of code that
calls it meant running the same cost engine outside a browser, inside VS
Code, for the first time. Six defects came out of that work. Every one of
them passed 735 tests and six CI gates cleanly — verified, all green — and
two of them reached the Marketplace before a person looked at the screen and
noticed something was off.

**A call with no token cap of its own silently inherited the cap from the
call above it, and priced it at that neighbor's rate.** The extension scans
a file for model IDs and their nearby `max_tokens` values; the backward
search for "which cap belongs to this call" stopped at the previous model
ID. That sounds like the right boundary. It isn't — a cap written between
two model IDs actually belongs to the earlier call's forward-looking window.
So a call that never specified an output ceiling displayed one anyway: a
real number, correctly multiplied, describing a request nobody had written.

**Exact token counting quietly degraded to an estimate**, and reported a
number either way, so nothing on screen said it had happened. The tokenizer
ships as four external files rather than bundled into the extension — bundle
it, and the download goes from 19.7 KB to 3.4 MB, because you'd be shipping
a full rank table to every editor window whether or not anyone ran the
estimate command. The packaging step that decides which files actually ship
diverged from the module resolution that looks for them at runtime, so a
release could pass every test and still leave one required file behind.
When that happens, the code catches the failed import and falls back to the
same calibrated-ratio estimate section 3 describes above — silently,
correctly formatted, indistinguishable on screen from an exact count. Not an
error. Not a crash. A plausible number, standing in for a real one, with
nothing to tell you which you were looking at.

Both defects share that shape, and so does every row above: the failure
mode of a pricing tool is not crashing. A crash is loud, and someone fixes
it that afternoon. The failure mode is returning a real-looking figure —
clean formatting, correct arithmetic, plausible magnitude — for a scenario
that isn't the one you asked about. Nothing about a wrong-but-plausible
number announces itself. The only defense is being able to check where it
came from, which is the same defense this article has been asking for from
every calculator in the category, including — it turns out — our own.

## Monitoring the promise, not the machinery

Fixing those two defects made the extension correct on the day it shipped.
It says nothing about whether the published catalog stays correct on every
day after. Those are different failure modes, and the second one has its own
watcher: a daily job that fetches `promptspend.com/data/pricing.json` — the
live site, not the repository — four hours after the sync runs, and opens an
alert if the catalog it finds is more than two days old.

The live site, deliberately, not the repository. Between a price moving at
a vendor and a reader seeing the update, there are four places the chain can
break: the sync can error, the sync can raise a review flag that sits
unmerged, the deploy can fail after a clean sync, or the CDN can serve a
stale build. Checking the file in git catches exactly one of those four.
Fetching what the site actually serves catches all of them, because it's
asking the question from where the answer matters — the reader's browser,
not a folder on a build server.

Monitor the promise you made to the reader, not the machinery you built to
keep it.

Every calculator in this category, including this one, is a pile of
assumptions wearing a clean interface. The nine on this page are the ones
that quietly favor a low number. The tenth is what happens when the people
who wrote the code stop trusting their own tests to catch the eleventh —
and start checking the thing they actually promised, instead of the thing
they built to promise it.
