/**
 * The whole stylesheet for the generated pages, as one string.
 *
 * These pages ship no JavaScript, so the theme is `prefers-color-scheme` alone —
 * there is no toggle, because a toggle needs a script and a script needs a
 * Content Security Policy exception, and neither is worth it on a page whose
 * job is to state some numbers and be readable in a search result.
 *
 * The colours are lifted from `src/styles/tokens.css` so a visitor arriving
 * from Google and then clicking into the calculator does not appear to change
 * websites. They are duplicated rather than imported because the app's tokens
 * are compiled into a hashed bundle these pages deliberately do not load.
 */
export const PAGE_CSS = `:root {
  color-scheme: light dark;
  --bg: #ebeff5;
  --surface: #ffffff;
  --surface-2: #fafbfd;
  --ink: #15181d;
  --muted: #5f6b78;
  --border: #dce2eb;
  --accent: #2456e6;
  --accent-soft: #e4eafc;
  --save: #0e7b43;
  --cost: #c62828;
  --warn: #9a5b08;
  --warn-soft: #f6ebd8;
  --shadow: 0 1px 2px rgb(21 24 29 / 5%), 0 6px 24px rgb(21 24 29 / 7%);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0b0e14;
    --surface: #121722;
    --surface-2: #1a2130;
    --ink: #e9ecf2;
    --muted: #93a0b4;
    --border: #27303f;
    --accent: #7c9dff;
    --accent-soft: rgb(124 157 255 / 15%);
    --save: #3ccb7f;
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
.wrap { max-width: 62rem; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }
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
tbody tr:last-child td { border-bottom: 0; }
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
ul.links { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.35rem; }
ul.plain { margin: 0; padding-left: 1.1rem; }
footer {
  margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid var(--border);
  color: var(--muted); font-size: 0.85rem;
}
footer a { color: var(--muted); }
`;
