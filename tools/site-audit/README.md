# One-command site audit

A first-pass audit of any public website, scored against the Crestwood Holdings
visibility scorecard (13 areas, 0 to 4 points each, weights totaling 25). It
scores the ten areas that public pages can show — 1, 2, 4, 5, 6, 7, 8, 9, 10 and
13, worth 76 points — and marks areas 3, 11 and 12 "needs owner access", since
they come from the owner's Search Console and Bing accounts.

```powershell
npx tsx tools/site-audit/audit.ts https://www.example.com
npx tsx tools/site-audit/audit.ts https://www.example.com --max-pages 200 --mobile --skip-broken-links
$env:PAGESPEED_API_KEY = "<key from Google Cloud>"; npx tsx tools/site-audit/audit.ts https://www.example.com
```

| Option                  | Default                    | Meaning                                                |
| ----------------------- | -------------------------- | ------------------------------------------------------ |
| `--max-pages <n>`       | 50 (at most 500)           | Stop crawling after this many pages                    |
| `--out-dir <dir>`       | `tools/site-audit/reports` | Where the report folder is written (ignored by git)    |
| `--mobile`              | off                        | Also run PageSpeed as a phone                          |
| `--skip-broken-links`   | off                        | Do not check links                                     |
| `--delay-ms <n>`        | 500 (at least 250)         | Pause between requests                                 |
| `--sitemap-sample <n>`  | 20 (at most 50)            | Sitemap addresses checked for a direct 200             |
| `--max-link-checks <n>` | 100                        | Links checked beyond the crawled pages, internal first |
| `--contact <address>`   | `info@promptspend.com`     | Contact named in the User-Agent                        |
| `PAGESPEED_API_KEY`     | unset                      | Without it, area 10 is "not checked"                   |

## What it writes

`<out-dir>/<domain>-<yyyy-MM-dd>/` holding `report.md` (the scorecard),
`report.json` (scorecard plus every reading), `findings.csv`, `pages.csv`, and
`raw/` (robots.txt, sitemaps, PageSpeed JSON). It ends with one line such as
`Scored 9 of 13 areas: 57 of 68 possible points. 0 serious issues. Report: ...`.
Exit code 0 means the audit finished, whatever the score; 1 means it could not
run (bad address, site down, robots.txt unreadable or blocking the home page).

`examples/promptspend.com-2026-10-30.md` is a real run against this project's
own site. Client reports are never committed.

## How it behaves

- GET and HEAD only. No logins, no forms, no cookies kept, no JavaScript run.
- robots.txt is read first and obeyed for the site, and for each outside site
  before one of its links is checked. An unreadable robots.txt (5xx) stops the
  audit, as it stops Google.
- One request at a time, `--delay-ms` apart, as
  `CrestwoodSiteAudit/1.0 (+https://github.com/AndrewAvery7/promptspend/tree/main/tools/site-audit; ...; contact ...)`.
- PageSpeed Insights only with `PAGESPEED_API_KEY`, sent in a header rather
  than the address.
- Every area carries the time it was read and the rule that scored it. A check
  that did not run is "not checked", never a pass.
- Audit only sites whose owner has agreed to it.

Pages are read as served. Text a script renders counts as 0 words, and a tag a
script loads is not seen; when a page's Content-Security-Policy allows Google
Analytics but no tag is in the HTML, area 13 says so, for the operator to
confirm in a browser.

The scoring lives in `lib/score.ts` and is tested from fixtures in
`lib/*.test.ts`, with no network.
