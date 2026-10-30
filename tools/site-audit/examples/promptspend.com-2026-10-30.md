# Website visibility audit: promptspend.com

**Site:** https://promptspend.com/  
**Read:** 2026-10-30 16:00 UTC to 2026-10-30 16:02 UTC, by the one-command audit (public pages only, read-only)  
**User-Agent:** `CrestwoodSiteAudit/1.0 (+https://github.com/AndrewAvery7/promptspend/tree/main/tools/site-audit; read-only website audit by Crestwood Holdings; contact info@promptspend.com)`

## Summary

**57 of 68 possible points** across the 9 areas this tool can score from public pages, or **84 out of 100** scaled (healthy). 0 serious issues.

Areas 3, 11 and 12 need the owner’s Search Console and Bing access and are scored by hand; any area marked "not checked" did not run and is not a pass. Until they are scored, this is a partial result: counting every unscored area as 0 gives 57 of 100.

_The crawl stopped at its cap of 50 pages, so page-level figures describe the pages closest to the home page, not the whole site._

## Scores

| #   | Area                             | Weight | Points (0-4)       | Score        | Evidence                                                                                                                                                                                                                                                                                                                                          | Read at              |
| --- | -------------------------------- | ------ | ------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | Search engine access             | 3      | 4                  | 12           | robots.txt read; home page open to Google, Bing and all crawlers; 1 sitemap(s) listed                                                                                                                                                                                                                                                             | 2026-10-30 16:00 UTC |
| 2   | Sitemaps                         | 2      | 4                  | 8            | 7 sitemap file(s) (1 index), 406 addresses; 20 of 20 sampled answered 200 directly                                                                                                                                                                                                                                                                | 2026-10-30 16:00 UTC |
| 3   | Pages stored by Google           | 3      | needs owner access | —            | needs owner access (Search Console Pages report)                                                                                                                                                                                                                                                                                                  | —                    |
| 4   | Duplicate and canonical pages    | 2      | 4                  | 8            | 48 of 48 crawled pages have a clean canonical (0% with a problem); 0 point to another address                                                                                                                                                                                                                                                     | 2026-10-30 16:01 UTC |
| 5   | Titles and descriptions          | 2      | 3                  | 6            | 48 pages: 0 missing or duplicate title/description, 6 outside the recommended length                                                                                                                                                                                                                                                              | 2026-10-30 16:01 UTC |
| 6   | Structured data                  | 1      | 4                  | 4            | home page types: WebApplication, Offer, Organization, WebSite; 48 of 48 pages carry JSON-LD; 0 parse error(s)                                                                                                                                                                                                                                     | 2026-10-30 16:01 UTC |
| 7   | Content depth                    | 3      | 2                  | 6            | 48 pages, median 727 words; 6 under 300 words; 0 near-duplicate pair(s); 13% flagged                                                                                                                                                                                                                                                              | 2026-10-30 16:01 UTC |
| 8   | Internal links                   | 2      | 3                  | 6            | 0 of 48 crawled pages more than 3 clicks deep; orphans not checked: the crawl stopped at its cap of 50 pages before reaching every page, so orphans cannot be told from pages not yet reached                                                                                                                                                     | 2026-10-30 16:01 UTC |
| 9   | Broken links and redirects       | 1      | 4                  | 4            | 150 links checked (150 internal): 0 broken, 0 redirect chain(s); 336 left unchecked by the cap                                                                                                                                                                                                                                                    | 2026-10-30 16:02 UTC |
| 10  | Speed for real visitors          | 2      | not checked        | —            | not checked: no PAGESPEED_API_KEY set                                                                                                                                                                                                                                                                                                             | —                    |
| 11  | Outside links                    | 2      | needs owner access | —            | needs owner access (Search Console and Bing backlink reports)                                                                                                                                                                                                                                                                                     | —                    |
| 12  | Search performance               | 1      | needs owner access | —            | needs owner access (Search Console performance report)                                                                                                                                                                                                                                                                                            | —                    |
| 13  | Measurement and privacy          | 1      | 3                  | 3            | GA4 tag on 0 of 6 sampled pages; analytics seen: Cloudflare Web Analytics; Google Analytics allowed by the Content-Security-Policy but not in the HTML, so probably loaded by a script this audit does not run (confirm in a browser); privacy page https://promptspend.com/privacy/ (HTTP 200) names: Google Analytics, Cloudflare Web Analytics | 2026-10-30 16:02 UTC |
|     | **Total (9 of 13 areas scored)** |        |                    | **57 of 68** |                                                                                                                                                                                                                                                                                                                                                   |                      |

## How each area was scored

- **1. Search engine access:** 0 if the home page is blocked for Google, Bing or all crawlers; 1 if robots.txt blocks a sitemap; 3 if robots.txt is missing or lists no sitemap; else 4.
- **2. Sitemaps:** 0 if no sitemap was found; 1 if none parsed as valid XML or it lists no addresses; else by the share of sampled addresses not answering 200 directly: 0% is 4, up to 10% is 3, more is 2.
- **3. Pages stored by Google:** Scored by hand from the owner’s accounts.
- **4. Duplicate and canonical pages:** By the share of crawled pages with a missing, relative or chained canonical: 0% is 4, up to 10% is 3, 30% is 2, 60% is 1, more is 0.
- **5. Titles and descriptions:** A missing or duplicate title or description is serious and scores by share (0% is 4, up to 10% is 3, 30% is 2, 60% is 1); a title outside 30-60 or description outside 70-160 characters is minor and alone never takes the area below 2.
- **6. Structured data:** 4 with Organization (or LocalBusiness) markup on the home page and no parse errors; 2 with one but not the other; 1 with only broken markup; 0 with none.
- **7. Content depth:** By the share of pages under 300 words of main content or near-duplicates of another page (90% the same text): 0% is 4, up to 10% is 3, 30% is 2, 60% is 1, more is 0.
- **8. Internal links:** By the share of pages more than 3 clicks deep or in the sitemap but linked from nowhere (0% is 4, up to 10% is 3, 30% is 2, 60% is 1); capped at 3 when orphans could not be checked.
- **9. Broken links and redirects:** By the share of checked links that fail (4xx, 5xx, no answer) or take more than one redirect: 0% is 4, up to 2% is 3, 5% is 2, 15% is 1, more is 0.
- **10. Speed for real visitors:** Per tested page: 4 when largest content is 2.5 s or less, interaction 200 ms or less and layout shift 0.1 or less; minus 1 for each metric needing improvement and 2 for each poor one. The area takes the lowest page. Field data when Google has it, lab data otherwise.
- **11. Outside links:** Scored by hand from the owner’s accounts.
- **12. Search performance:** Scored by hand from the owner’s accounts.
- **13. Measurement and privacy:** 4 when one GA4 id is on every sampled page and the privacy page names every analytics product found; 3 when the only analytics is not GA4 but is named; 2 when tags are missing on some pages, ids differ, or the privacy page omits a product; 1 with no analytics at all or no privacy page. The operator confirms the privacy wording by reading it.

## Findings (12)

- **warning** (content) https://promptspend.com/: Thin page: 0 words
- **warning** (content) https://promptspend.com/providers/: Thin page: 209 words
- **warning** (content) https://promptspend.com/writing/: Thin page: 142 words
- **warning** (content) https://promptspend.com/data/: Thin page: 267 words
- **warning** (content) https://promptspend.com/receipt/: Thin page: 0 words
- **warning** (content) https://promptspend.com/app/: Thin page: 290 words

6 more, including minor length notes, are in `findings.csv`.

## What this audit did not verify

- Areas 3, 11 and 12 (indexing, outside links, search performance) need the owner’s accounts.
- Whether Google actually accepted the sitemaps; this reads them, it does not see Search Console.
- The privacy page is matched by product name only; read it before scoring area 13 for real.
- Pages are read as served, without running JavaScript: text a script renders counts as 0 words, and a tag a script loads is not seen (a Content-Security-Policy that allows one is noted under area 13).
- Speed: no PAGESPEED_API_KEY set.
