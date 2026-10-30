/** The scorecard as the files an operator reads: Markdown, JSON and two CSVs. */
import type { Scorecard } from './score';
import type { AuditEvidence } from './types';

function cell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\s+/g, ' ');
}

function when(iso: string | null): string {
  return iso ? `${iso.slice(0, 16).replace('T', ' ')} UTC` : '—';
}

export function summaryLine(card: Scorecard, reportPath: string): string {
  return `Scored ${card.scoredAreas} of 13 areas: ${card.points} of ${card.possible} possible points. ${card.serious} serious issue${card.serious === 1 ? '' : 's'}. Report: ${reportPath}`;
}

export function renderMarkdown(card: Scorecard, evidence: AuditEvidence): string {
  const host = new URL(evidence.home).hostname;
  const lines: string[] = [];
  lines.push(`# Website visibility audit: ${host}`, '');
  lines.push(
    `**Site:** ${evidence.home}  `,
    `**Read:** ${when(evidence.startedAt)} to ${when(evidence.finishedAt)}, by the one-command audit (public pages only, read-only)  `,
    `**User-Agent:** \`${evidence.userAgent}\``,
    '',
  );
  lines.push('## Summary', '');
  if (card.scaled === null) {
    lines.push('Nothing could be scored.', '');
  } else {
    lines.push(
      `**${card.points} of ${card.possible} possible points** across the ${card.scoredAreas} areas this tool can score from public pages, or **${card.scaled} out of 100** scaled (${card.band}). ${card.serious} serious issue${card.serious === 1 ? '' : 's'}.`,
      '',
      `Areas 3, 11 and 12 need the owner’s Search Console and Bing access and are scored by hand${card.scoredAreas < 10 ? '; any area marked "not checked" did not run and is not a pass' : ''}. Until they are scored, this is a partial result: counting every unscored area as 0 gives ${card.points} of 100.`,
      '',
    );
  }
  if (!evidence.crawl.complete) {
    lines.push(
      `_The crawl stopped at its cap of ${evidence.crawl.maxPages} pages, so page-level figures describe the pages closest to the home page, not the whole site._`,
      '',
    );
  }
  lines.push('## Scores', '');
  lines.push('| # | Area | Weight | Points (0-4) | Score | Evidence | Read at |');
  lines.push('|---|------|--------|--------------|-------|----------|---------|');
  for (const area of card.areas) {
    const points =
      area.status === 'scored'
        ? String(area.points)
        : area.status === 'owner-access'
          ? 'needs owner access'
          : 'not checked';
    lines.push(
      `| ${area.number} | ${area.area} | ${area.weight} | ${points} | ${area.score ?? '—'} | ${cell(area.evidence)} | ${when(area.readAt)} |`,
    );
  }
  lines.push(
    `| | **Total (${card.scoredAreas} of 13 areas scored)** | | | **${card.points} of ${card.possible}** | | |`,
    '',
  );

  lines.push('## How each area was scored', '');
  for (const area of card.areas.filter((a) => a.rule))
    lines.push(`- **${area.number}. ${area.area}:** ${area.rule}`);
  lines.push('');

  const order = { serious: 0, warning: 1, info: 2 };
  const findings = [...card.findings].sort((a, b) => order[a.severity] - order[b.severity]);
  lines.push(`## Findings (${findings.length})`, '');
  if (findings.length === 0) lines.push('None.');
  const shown = findings.filter((finding) => finding.severity !== 'info').slice(0, 40);
  for (const finding of shown)
    lines.push(`- **${finding.severity}** (${finding.check}) ${finding.page}: ${finding.detail}`);
  const rest = findings.length - shown.length;
  if (rest > 0) lines.push('', `${rest} more, including minor length notes, are in \`findings.csv\`.`);
  lines.push('');

  lines.push('## What this audit did not verify', '');
  lines.push(
    '- Areas 3, 11 and 12 (indexing, outside links, search performance) need the owner’s accounts.',
    '- Whether Google actually accepted the sitemaps; this reads them, it does not see Search Console.',
    '- The privacy page is matched by product name only; read it before scoring area 13 for real.',
    '- Pages are read as served, without running JavaScript: text a script renders counts as 0 words, and a tag a script loads is not seen (a Content-Security-Policy that allows one is noted under area 13).',
  );
  if (evidence.speed.notChecked) lines.push(`- Speed: ${evidence.speed.notChecked}.`);
  if (evidence.links.notChecked) lines.push(`- Links: ${evidence.links.notChecked}.`);
  return `${lines.join('\n')}\n`;
}

function csvField(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return [header, ...rows].map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export function findingsCsv(card: Scorecard): string {
  return toCsv(
    ['page', 'check', 'severity', 'detail'],
    card.findings.map((finding) => [finding.page, finding.check, finding.severity, finding.detail]),
  );
}

export function pagesCsv(evidence: AuditEvidence): string {
  const linksIn = new Map<string, number>();
  for (const page of evidence.crawl.pages) {
    for (const url of page.internalLinks) linksIn.set(url, (linksIn.get(url) ?? 0) + 1);
  }
  return toCsv(
    [
      'address',
      'status',
      'depth',
      'title length',
      'description length',
      'word count',
      'canonical',
      'links in',
      'links out',
      'read at',
    ],
    evidence.crawl.pages.map((page) => [
      page.url,
      page.status,
      page.depth,
      page.title?.length ?? null,
      page.description?.length ?? null,
      page.isHtml ? page.wordCount : null,
      page.canonical,
      linksIn.get(page.url) ?? 0,
      page.internalLinks.length + page.outboundLinks.length,
      page.readAt,
    ]),
  );
}

/** The scorecard and its evidence as one JSON file, minus the page text the near-duplicate check used. */
export function reportJson(card: Scorecard, evidence: AuditEvidence): string {
  const slim = {
    ...evidence,
    crawl: { ...evidence.crawl, pages: evidence.crawl.pages.map(({ text: _text, ...page }) => page) },
  };
  return `${JSON.stringify({ scorecard: card, evidence: slim }, null, 2)}\n`;
}
