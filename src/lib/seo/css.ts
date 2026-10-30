/**
 * The whole stylesheet for the generated pages, as one string.
 *
 * Without scripts, the theme is `prefers-color-scheme` alone. With them (since
 * 2026-10-24 every page carries the calculator's live header, from
 * `src/chrome/site-header.tsx`) a small blocking script sets `data-theme`,
 * `data-accent` and `data-canvas` from the visitor's saved choices before first
 * paint, and the site's token sheet - linked beside this one - takes over. So
 * the tokens below apply only while `data-theme` is absent: the page reads
 * completely either way, which is what a crawler and a reader with scripts off
 * get.
 *
 * The colors are lifted from `src/styles/tokens.css` so a visitor arriving
 * from Google and then clicking into the calculator does not appear to change
 * websites. They are duplicated rather than imported because the app's tokens
 * are compiled into a hashed bundle these pages deliberately do not load.
 */
export const PAGE_CSS = `:root { color-scheme: light dark; }
:root[data-theme='light'] { color-scheme: light; }
:root[data-theme='dark'] { color-scheme: dark; }
/* These tokens are the page's own, for a visitor with no scripts. Once the
 * theme script has set data-theme (it does so before first paint), the same
 * names come from the site's token sheet instead, which is what lets the
 * header's theme switch, accent and canvas pickers repaint the whole page. */
:root:not([data-theme]) {
  --bg: #ebeff5;
  --surface: #ffffff;
  --surface-2: #fafbfd;
  --ink: #15181d;
  --muted: #5f6b78;
  --border: #dce2eb;
  --accent: #2456e6;
  --accent-soft: #e4eafc;
  --save: #0e7b43;
  --save-soft: #e3f0e8;
  --cost: #c62828;
  --warn: #9a5b08;
  --warn-soft: #f6ebd8;
  --shadow: 0 1px 2px rgb(21 24 29 / 5%), 0 6px 24px rgb(21 24 29 / 7%);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    --bg: #0b0e14;
    --surface: #121722;
    --surface-2: #1a2130;
    --ink: #e9ecf2;
    --muted: #93a0b4;
    --border: #27303f;
    --accent: #7c9dff;
    --accent-soft: rgb(124 157 255 / 15%);
    --save: #3ccb7f;
    --save-soft: rgb(51 166 100 / 14%);
    --cost: #f97066;
    --warn: #f5b849;
    --warn-soft: rgb(245 184 73 / 13%);
    --shadow: 0 1px 2px rgb(0 0 0 / 50%), 0 10px 30px rgb(0 0 0 / 40%);
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-text-size-adjust: 100%;
}
/* The same 1280px frame and 24px gutter as the calculator's header and footer
 * (src/styles/app.css, footer.css), so moving between the calculator and these
 * pages does not change the page width. Long prose keeps its own measure below. */
.wrap { max-width: 1280px; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }
@media (min-width: 641px) { .wrap { padding-left: 24px; padding-right: 24px; } }
a { color: var(--accent); }
a:hover { text-decoration: none; }
.skip {
  position: absolute; left: -9999px; top: 0; background: var(--surface);
  padding: 0.5rem 1rem; z-index: 2;
}
.skip:focus { left: 0; }
.crumbs { font-size: 0.85rem; color: var(--muted); padding: 0.75rem 0; }
.crumbs a { color: var(--muted); }
.crumbs span { padding: 0 0.35rem; }
h1 { font-size: clamp(1.6rem, 1.1rem + 2vw, 2.4rem); line-height: 1.15; margin: 0.5rem 0 0.35rem; }
h2 { font-size: 1.2rem; margin: 2.25rem 0 0.75rem; }
h3 { font-size: 1rem; margin: 0 0 0.25rem; }
.lede { color: var(--muted); margin: 0 0 1.5rem; font-size: 0.95rem; }
.card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
  padding: 1.1rem 1.25rem; box-shadow: var(--shadow); margin: 0 0 1rem;
}
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); }
.tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
table { border-collapse: collapse; width: 100%; font-size: 0.93rem; }
th, td { text-align: left; padding: 0.55rem 0.7rem; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 600; white-space: nowrap; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
tbody tr:last-child td, tbody tr:last-child th { border-bottom: 0; }
.big { font-size: 1.6rem; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.unit { color: var(--muted); font-size: 0.85rem; }
.muted { color: var(--muted); }
.small { font-size: 0.85rem; }
/* Table captions. A class rather than a style attribute, because the policy on
 * these pages is style-src 'self' with no 'unsafe-inline' — an inline style
 * attribute would simply be dropped, and silently. */
caption.cap { text-align: left; padding-bottom: 0.5rem; }
.save { color: var(--save); }
.cost { color: var(--cost); }
.pill {
  display: inline-block; background: var(--accent-soft); color: var(--accent);
  border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.78rem; font-weight: 600;
}
/* The marker beside a promotional rate — the same one the app draws, on the
 * same warn tokens. Its tooltip is a title attribute, which needs no script. */
.rate-promo {
  position: relative; display: inline-block; width: 0.8em; height: 0.8em; margin-left: 0.3em; padding: 0.1em;
  vertical-align: -0.12em; border-radius: 0.2em; background: var(--warn-soft); color: var(--warn);
  line-height: 0; cursor: help;
}
.rate-promo svg { display: block; width: 100%; height: 100%; }
.visually-hidden {
  position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
}
.note {
  background: var(--warn-soft); border-left: 3px solid var(--warn);
  padding: 0.6rem 0.85rem; border-radius: 0 8px 8px 0; font-size: 0.9rem; margin: 0.75rem 0 0;
}
.cta {
  display: inline-block; background: var(--accent); color: #fff; text-decoration: none;
  padding: 0.6rem 1.1rem; border-radius: 8px; font-weight: 600;
}
@media (prefers-color-scheme: dark) { .cta { color: #08122b; } }
.cta:hover { opacity: 0.92; }
.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1.2rem; margin: 1rem 0 0.25rem; }
ul.links { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.35rem; }
/* The price-history chart: plain SVG, colored from the page's tokens. The
 * output line is dashed as well as a different color, so the two lines are
 * told apart without relying on color alone. */
td.when { white-space: nowrap; }
/* The token counter: a text box, a model picker and a row of figures. */
.tc-label { display: block; font-weight: 600; margin: 0 0 0.35rem; }
.tc-text, .tc-select {
  width: 100%; font: inherit; color: var(--ink); background: var(--surface-2);
  border: 1px solid var(--border); border-radius: 8px; padding: 0.65rem 0.75rem;
}
.tc-text { min-height: 12rem; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9rem; }
.tc-select { margin-bottom: 1rem; }
.tc-text:focus-visible, .tc-select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tc-stats { display: grid; gap: 0.75rem 1.25rem; grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr)); margin: 0 0 0.5rem; }
.tc-stats dt { color: var(--muted); font-size: 0.8rem; }
.tc-stats dd { margin: 0; font-size: 1.35rem; font-weight: 650; font-variant-numeric: tabular-nums; }
.tc .note { margin: 0.75rem 0 1rem; }
/* Question-and-answer sections: plain headings and paragraphs, nothing to expand. */
.faq h3 { margin: 1.1rem 0 0.2rem; font-size: 1rem; }
.faq h3:first-child { margin-top: 0; }
.faq p { margin: 0; max-width: 46rem; overflow-wrap: anywhere; }
.chart-card { margin: 0 0 1rem; }
.chart { display: block; width: 100%; max-width: 640px; height: auto; margin: 0 auto; overflow: visible; }
.chart-grid { stroke: var(--border); stroke-width: 1; }
.chart-axis { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.chart-label { fill: var(--ink); font-size: 12px; font-weight: 600; }
.chart-line { fill: none; stroke-width: 2.5; stroke-linejoin: round; }
.chart-line.chart-input, .chart-dot.chart-input { stroke: var(--accent); }
.chart-line.chart-output, .chart-dot.chart-output { stroke: var(--ink); }
.chart-line.chart-output { stroke-dasharray: 7 4; }
.chart-dot { fill: var(--surface); stroke-width: 2.5; }
figure.card figcaption { margin-top: 0.5rem; text-align: center; }
ul.plain { margin: 0; padding-left: 1.1rem; }
article p { margin: 0 0 1.1rem; max-width: 42rem; }
/* The app page is a few short paragraphs among a full-width list and badges, so
 * a 42rem cap on only the paragraphs made the page look narrower than it is. */
article.app-page p { max-width: none; }
article pre:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
article pre {
  background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px;
  padding: 0.85rem 1rem; overflow-x: auto; font-size: 0.85rem; line-height: 1.5; margin: 0 0 1.1rem;
}
article code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
article :not(pre) > code {
  background: var(--surface-2); padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.88em;
}
/* The header is the calculator's own (src/styles/header.css, loaded beside this
 * sheet). Its mount point must not make a box of its own: a sticky header only
 * sticks inside its parent, and this parent would be exactly as tall as it. */
#site-header { display: contents; }
/* The footer, drawn to match the calculator's (src/styles/footer.css): the apps
 * band, four headed link columns beside the name, one "Listed on" row of
 * badges, then a last line with the license and the counts. */
.footer { margin-top: 3rem; border-top: 1px solid var(--border); }
.footer__inner {
  max-width: 1280px; margin: 0 auto; padding: 20px 24px 18px; display: flex; flex-direction: column;
  font-size: max(0.75rem, 12px); color: var(--muted);
}
.footer a { color: var(--accent); }
.footer__cols { display: grid; grid-template-columns: 1.5fr repeat(4, 1fr); gap: 20px 28px; padding: 22px 0 18px; }
.footer__brand-name { margin: 0 0 6px; font-size: 1rem; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); }
.footer__brand p:not(.footer__brand-name) { margin: 0 0 10px; max-width: 34ch; line-height: 1.55; }
.footer__gh { display: inline-flex; align-items: center; min-height: 44px; font-weight: 500; }
.footer__col h2 {
  margin: 0 0 6px; font-size: max(0.75rem, 12px); font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--ink);
}
.footer__col ul { list-style: none; margin: 0; padding: 0; }
.footer__col a { display: block; padding: 4px 0; font-size: 0.8125rem; }
@media (max-width: 860px) {
  .footer__cols { grid-template-columns: 1fr 1fr; gap: 18px 20px; }
  .footer__brand { grid-column: 1 / -1; }
  .footer__col a { padding: 0; min-height: 44px; display: flex; align-items: center; }
}
/* Every badge card 34px tall, all eight on one line on a computer; a grid of
 * two on a phone, each centered in an equal cell. The link carries the 44px a
 * thumb needs. mcpservers.org's is a strip, not a card: 22px. */
.footer__badge {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px;
  border-top: 1px solid var(--border); padding-top: 10px;
}
.footer__listed { margin-right: 4px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.footer__badge a { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; }
.footer__badge img { display: block; height: 34px; width: auto; }
.footer__badge img.footer__badge-strip { height: 22px; }
@media (max-width: 600px) {
  .footer__badge { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; }
  .footer__listed { grid-column: 1 / -1; }
  .footer__badge img { height: 32px; }
  .footer__badge img.footer__badge-strip { height: 18px; }
}
.footer__legal {
  display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 20px;
  border-top: 1px solid var(--border); margin-top: 8px; padding-top: 12px;
}
.footer__stats { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
/* The apps band at the top of every footer (src/styles/footer.css draws the
 * same one in the calculator): one row of the pitch, the store badges and the
 * QR codes. The store badge and QR rules below are the app page's; inside the
 * band they are re-sized to match the calculator's. */
.footer__apps {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px 28px;
  background: var(--accent-soft); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px;
}
.footer__apps-text { flex: 1 1 280px; }
.footer__apps-title { margin: 0; font-size: 0.95rem; font-weight: 650; letter-spacing: -0.01em; color: var(--ink); }
.footer__apps-sub { margin: 2px 0 0; line-height: 1.45; }
.footer__apps .store-badges { margin: 0; gap: 10px; }
.footer__apps .store-qr { margin: 0; gap: 12px; }
.footer .store-qr__code { color: var(--muted); font-size: max(0.75rem, 12px); }
.footer__apps .store-qr__code img { width: 64px; height: 64px; border-radius: 8px; }
.footer__apps-credit { flex-basis: 100%; margin: 0; line-height: 1.5; }
@media (max-width: 860px), (hover: none) { .footer__apps-credit { display: none; } }
/* The app page. Badge links carry the 44px a thumb needs; the artwork is the
   stores' standard 40px. The QR codes show only on a wide screen with a
   hovering pointer, because the phone in your hand cannot scan itself. */
.store-badges { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0 0 1.25rem; }
.store-badges a { display: inline-flex; align-items: center; min-height: 44px; }
.store-badges img { display: block; height: 40px; width: auto; }
.store-qr { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 1rem 1.5rem; margin: 0 0 1.5rem; }
.store-qr__hint { margin: 0 0 0.75rem; color: var(--muted); font-size: 0.9rem; }
.store-qr__code {
  display: flex; flex-direction: column; align-items: center; gap: 0.35rem;
  color: var(--muted); font-size: 0.85rem; font-weight: 600; text-decoration: none;
}
/* White in both themes: a QR code needs its light quiet zone to scan. */
.store-qr__code img { display: block; width: 132px; height: 132px; background: #fff; border: 1px solid var(--border); border-radius: 10px; }
@media (max-width: 860px), (hover: none) { .store-qr { display: none; } }
.credit { color: var(--muted); font-size: 0.78rem; margin-top: 2rem; }
/* Free-tier pages. The verdict is a word first and a color second: the label
 * carries the answer, the tint only helps a reader scan the comparison table.
 * Green is reserved for "you can start free", matching the app's rule that
 * green always means money kept. */
.verdict {
  display: inline-block; border-radius: 999px; padding: 0.15rem 0.7rem;
  font-size: 0.82rem; font-weight: 650; white-space: nowrap;
  background: var(--surface-2); color: var(--muted); border: 1px solid var(--border);
}
.verdict-ongoing { background: var(--save-soft); color: var(--save); border-color: transparent; }
.verdict-one-time { background: var(--accent-soft); color: var(--accent); border-color: transparent; }
.verdict-unclear { background: var(--warn-soft); color: var(--warn); border-color: transparent; }
.verdict-none { background: var(--surface-2); color: var(--muted); }
.answer { margin-top: 1rem; }
.answer p { margin: 0; }
.answer .answer-text { margin-top: 0.6rem; font-size: 1.08rem; line-height: 1.5; max-width: 42rem; }
ul.facts { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.75rem; }
.fact {
  background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
  padding: 0.85rem 1rem;
}
.fact > p { margin: 0 0 0.4rem; max-width: 46rem; }
.fact .src { font-size: 0.85rem; color: var(--muted); margin: 0.45rem 0 0; }
.fact .src a { color: var(--muted); }
.fact .conflict { font-size: 0.88rem; color: var(--warn); font-weight: 600; }
/* The vendor's own words, folded by default: the statement above is the
 * readable version, and this is the evidence for it. <details> opens without
 * a script, which is why it is used rather than a toggle. */
details.quote summary {
  cursor: pointer; font-size: 0.88rem; color: var(--accent); font-weight: 600;
  min-height: 24px; display: inline-flex; align-items: center;
}
details.quote blockquote {
  margin: 0.5rem 0 0; padding: 0.5rem 0.85rem; border-left: 3px solid var(--border);
  background: var(--surface-2); border-radius: 0 8px 8px 0; font-size: 0.92rem;
  overflow-wrap: anywhere;
}
details.quote blockquote p { margin: 0; }
@media (pointer: coarse) { details.quote summary { min-height: 44px; } }
th[scope='row'] { width: 40%; white-space: normal; }
`;
