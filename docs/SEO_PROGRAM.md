# SEO program: baseline, plan and change log

This is the working record of the effort to make promptspend.com easy for search engines and assistants to find and trust, and to measure whether the work did anything. It exists so that a result can be judged against what was written down **before** the result was known. The repository is public, so the commit dates of this file are checkable.

Three things live here: the day-0 baseline, the 90-day plan with its pass-or-fail measures, and a dated change log. The plan's wider scope (82 activities in nine workstreams) is in the register kept outside this repository; this file holds only what needs to be checkable from the code's history.

## Rules the program keeps

- No fake ratings or reviews, no mass-produced thin pages and no paid SEO tools.
- Anything that touches a public privacy promise is rewritten in the same release and audited first.
- Every number below names its source and the date it was read.
- A number that cannot be verified is labeled a belief, not reported as a finding.

## Day-0 baseline (read on 2026-10-29)

The machine-readable copy is [seo/baseline-2026-10-29.json](seo/baseline-2026-10-29.json).

**Google Search Console** (domain property `promptspend.com`)

| Measure                           | Value                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Pages indexed                     | 161 (report last updated 2026-10-22)                                                                                                 |
| Pages not indexed                 | 182, in six groups                                                                                                                   |
| of which: alternate page          | 118. Every example is a calculator scenario link (`/?m=...`). The `robots.txt` rule added on 2026-10-29 asks Google to skip them     |
| of which: discovered, not indexed | 47. Every example is a comparison page Google found and has not yet crawled                                                          |
| of which: redirect error          | 8. All last crawled 2026-08-07 or 08. The same addresses now answer with one clean redirect                                          |
| of which: not found, redirect     | 4 and 4                                                                                                                              |
| of which: crawled, not indexed    | 1                                                                                                                                    |
| Search, last 90 days              | 8 clicks, 970 impressions, 0.8% click rate, average position 37.7, 87 distinct queries                                               |
| Search, last 28 days              | 0 clicks, 12 impressions                                                                                                             |
| Shape of the 90 days              | Impressions rose from early August, peaked in the last two weeks of August, and fell to near zero after about 7 September            |
| External links                    | 42, all to the home page. 22 from ycombinator.com, 4 from github.com, one each from agentcatalog.com, algolia.com, alternativeto.net |
| Internal links                    | 632                                                                                                                                  |

**Bing Webmaster Tools**

| Measure                     | Value                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Sitemap before resubmission | `sitemap.xml`, 372 pages discovered, last read 2026-10-26                                                         |
| Backlinks                   | 24 referring domains, 83 referring pages, 17 anchor texts (one domain, parkscomputing.com, supplies 54 of the 83) |

**The site itself** (live files on 2026-10-29)

| Measure                      | Value                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sitemap                      | An index of six files listing 403 addresses: 229 comparisons, 126 models, 16 free tiers, 16 providers, 13 site pages, 3 writing                                                                                                                                                                                                                                            |
| Google's read                | Read the new index on 2026-10-29 and accepted all six files                                                                                                                                                                                                                                                                                                                |
| Real visitors                | 22 visits and 29 page views in the 24 hours to 2026-10-29, bots excluded (Cloudflare's cookieless counter). The earlier belief of about 11 a day was lower; one day is a thin sample                                                                                                                                                                                       |
| Page speed for real visitors | Cloudflare Web Analytics, 24 hours to 2026-10-29, bots excluded: the largest content takes about 1.3 seconds to appear at the 75th percentile (57 ms waiting for the server, 1.28 s drawing), inside the 2.5 second good range. Interaction delay is in the good range for every sample, and there are few. Layout shift was not read. About 22 visits, so indicative only |

## The 90-day plan, written before the results

**Status: confirmed by Andrew on 2026-10-29, as proposed.** The thresholds were guesses when they were written and are not moved after the fact. If one proves badly chosen, the change log says so and the original stays here. Review dates: day 28 is 2026-11-26, day 59 is 2026-12-27 and day 90 is 2027-01-27.

The working explanation for the fall in September is that Google re-evaluated a young site made mostly of templated pages and chose to show it far less. That is a belief. Nothing in Search Console reports a manual action. The plan tests it by changing the things that explanation points at and watching the same measures.

| #   | Hypothesis                                                                                     | Measure and source                                                    | Pass at day 90                         | Fail at day 90 |
| --- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- | -------------- |
| H1  | A clearer structure and more internal links lead Google to store more of the real pages        | Search Console, Pages report: indexed count                           | 200 or more (baseline 161)             | 161 or fewer   |
| H2  | Comparison pages that are worth citing get crawled                                             | Discovered-not-indexed count                                          | 25 or fewer (baseline 47)              | 47 or more     |
| H3  | The `robots.txt` rule slowly removes the calculator scenario links from the "not indexed" pile | Alternate-page count                                                  | 60 or fewer (baseline 118)             | 118 or more    |
| H4  | Search visibility recovers                                                                     | Search Console impressions in the latest 28 days                      | 100 or more (baseline 12)              | 30 or fewer    |
| H5  | Visibility turns into visits                                                                   | Search Console clicks in the latest 28 days                           | 5 or more (baseline 0)                 | 0              |
| H6  | The site earns more links from independent places                                              | Search Console and Bing referring domains, counted together once each | 35 or more (baseline 24 in Bing alone) | 24 or fewer    |

What would change the conclusion: a Google core update inside the window, a change to how the site is reported (a new property or a changed domain), or a run of days when the site was down. Any of these is written in the change log below when it happens, so the number can be read in context.

At about 11 visits a day, daily changes in these numbers are mostly noise. Judge them on the review dates, not between them.

## Directory submissions for the MCP server

Each listing is a place an assistant or a developer can find the server, and a link back to the site. Nothing is submitted without Andrew's say-so, and each directory's own form decides what it accepts. Routes were read on 2026-10-29 and should be re-checked when used.

| Directory             | State                                                                                                                                                                                                                                                                  | Next step                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Official MCP registry | Set up: `server.json` and `mcpName`, published by `publish-mcp.yml` when an `mcp-v*` tag is pushed                                                                                                                                                                     | None                                                                            |
| Glama                 | Submitted 2026-10-28 from Andrew's Glama account, waiting for approval                                                                                                                                                                                                 | Wait for the approval email                                                     |
| PulseMCP              | A third-party issue says it reads the official registry weekly. Not verified                                                                                                                                                                                           | Look for the listing on pulsemcp.com in a week; submit by hand if it is missing |
| mcp.so                | Dropped by Andrew on 2026-10-29. Its submit form offers only a $39 paid submission when signed out, and the project will not pay for a listing. Nothing submitted                                                                                                      | None                                                                            |
| Smithery              | Not possible. Tried on 2026-10-29 while signed in: the final publish step failed with `403 Updating servers has been removed. Contact support@smithery.ai`, and no listing was created. Its notice (smithery.ai/future) says accounts and publishing end on 2026-10-31 | Nothing, unless Smithery support says otherwise                                 |
| awesome-mcp-servers   | Pull request opened 2026-10-29 under Andrew's account: `punkpeye/awesome-mcp-servers#18038`, one line in Developer Tools, with the agent opt-in their guide describes                                                                                                  | Watch the pull request; the maintainers may ask for changes                     |

Text to paste:

- **Name:** PromptSpend
- **One line:** LLM API prices for coding agents. Every price carries its source and the date it was last confirmed.
- **Longer:** Look up what a model costs, estimate the bill for a workload, or find a cheaper model that fits. Prices come from the vendors' own pages, are re-checked every morning, and disputed prices are marked rather than hidden. Free, no account.
- **Tools:** `get_price`, `estimate_cost`, `find_cheaper`
- **Install:** `claude mcp add promptspend -- npx -y @promptspend/mcp`, or the hosted endpoint `https://promptspend.dev/mcp`
- **Links:** `https://promptspend.com`, `https://github.com/AndrewAvery7/promptspend`, `https://www.npmjs.com/package/@promptspend/mcp`
- **License:** MIT
- **List line:** `- [AndrewAvery7/promptspend](https://github.com/AndrewAvery7/promptspend) 📇 ☁️ - LLM API prices with a source and a confirmation date on every figure; estimate a bill or find a cheaper model.`

## Change log

Every deploy, report, outreach message and setting change that could move these numbers gets a line here, dated, in the same pull request. Newest first.

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-30 | GA watch added (`scripts/ga-watch.ts`, `ga-watch.yml`): daily alarm when GA counts no sessions while Cloudflare counts visitors, weekly check that GA settings match the privacy page, four-week baseline ratios from 2026-11-30. Skips until Andrew adds the read-only keys. Build now fails if a featured comparison drops below 450 words or loses a section, or a provider page loses its sections                                                                     |
| 2026-10-30 | Wave 2, content batch: 26 featured comparisons gain a verdict per workload, break-even points, both price histories and an independent benchmark (Artificial Analysis, 14 models, each row re-checked against the live page; four bad rows fixed or removed first). Growth of the comparison set frozen at 229. Provider pages gain four sub-headed sections. New `/about/` (name and short bio, approved by Andrew), `/corrections/`, `/topics/` and `/data/changes.json` |
| 2026-10-29 | Google Analytics key events: `store_click` (App Store or Google Play button, with which store), `install_copy` (Copy beside the MCP, API or VS Code command, with which), `model_added` (a model added to the comparison, with its id). Tagged link for the Expo co-promotion: `https://promptspend.com/?utm_source=expo&utm_medium=referral&utm_campaign=expo-copromo`                                                                                                    |
| 2026-10-29 | mcp.so dropped: Andrew will not pay its $39 submission fee. The MCP directory work is closed                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-10-29 | Smithery: tried to publish the hosted endpoint while signed in; Smithery refused (publishing already removed). No listing exists                                                                                                                                                                                                                                                                                                                                           |
| 2026-10-29 | MCP directory work: a pull request opened to add the server to awesome-mcp-servers. mcp.so (paid only) and Smithery (needs a sign-in) left for Andrew. Real-visitor page speed read from Cloudflare                                                                                                                                                                                                                                                                        |
| 2026-10-29 | The 90-day plan's six thresholds confirmed by Andrew exactly as proposed. From here they are fixed                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-29 | Home page: the no-JavaScript text now has a heading, a description and links to every main section. Baseline and this plan written. A tally script for the monthly price report added (`scripts/monthly-report-tally.ts`); the October report is written on 1 November, from the whole month                                                                                                                                                                               |
| 2026-10-29 | Structure batch live (pull request 317): sitemap split into six files, related comparisons, `/writing/`, `/data/`, a 404 page, favicon files, organization data on the home page, `robots.txt` skips scenario links. Sitemap resubmitted to Bing; Google read it the same day                                                                                                                                                                                              |
| 2026-10-29 | Google Analytics opened to every feature (full addresses with campaign tags, signals, ad personalization, 14-month retention); privacy page rewritten                                                                                                                                                                                                                                                                                                                      |
| 2026-10-29 | Google Analytics back on with a new property owned by Crestwood Holdings (G-P27XJ53BH9); privacy page rewritten in the same change                                                                                                                                                                                                                                                                                                                                         |
| 2026-10-29 | Google Analytics switched off on the site (pull request 314). No Analytics account existed to receive the data                                                                                                                                                                                                                                                                                                                                                             |
| 2026-10-24 | Google Analytics switched on, with a notice on the site                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-09-27 | Previous look at how Google saw the comparison pages                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-09-07 | About here, search impressions fall to near zero (read from the Search Console chart, so approximate)                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-07 | Google's first crawl of the early page set. Eight addresses returned redirect errors; they now redirect cleanly                                                                                                                                                                                                                                                                                                                                                            |
| 2026-08-02 | First catalog published; the site's first sitemap submitted to Bing                                                                                                                                                                                                                                                                                                                                                                                                        |
