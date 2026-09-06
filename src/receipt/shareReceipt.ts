export interface ShareReceiptData {
  conversation: string;
  estimatedTokens: string;
  currentModel: string;
  estimatedCost: string;
  alternativeModel: string;
  alternativeCost: string;
  priceDifference: string;
  note: string;
}

export const DEFAULT_SHARE_RECEIPT: ShareReceiptData = {
  conversation: '47 visible turns',
  estimatedTokens: '128,440 estimated',
  currentModel: 'Unknown',
  estimatedCost: 'Current pricing required',
  alternativeModel: 'Test a compatible lower-cost model',
  alternativeCost: 'Compare after testing',
  priceDifference: 'Not established',
  note: 'Estimate, not invoice. Quality equivalence is not assumed.',
};

const KEYS = Object.keys(DEFAULT_SHARE_RECEIPT) as (keyof ShareReceiptData)[];

export function parseShareReceipt(input: string): ShareReceiptData {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Paste the receipt JSON returned by your assistant.');

  const fenced = trimmed.match(/```(?:promptspend-receipt|json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1]?.trim() ?? trimmed;
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error('That is not valid receipt JSON. Copy the full promptspend-receipt block.');
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The receipt must be a JSON object.');
  }

  const record = value as Record<string, unknown>;
  const nested = record.receipt;
  const candidate =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : record;
  const output = { ...DEFAULT_SHARE_RECEIPT };
  let recognized = 0;

  for (const key of KEYS) {
    const raw = candidate[key];
    if (typeof raw !== 'string') continue;
    const normalized = raw
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, key === 'note' ? 180 : 90);
    if (!normalized) continue;
    output[key] = normalized;
    recognized += 1;
  }

  if (recognized < 4) {
    throw new Error('The JSON is missing receipt fields. Ask the assistant to return the full share block.');
  }

  return output;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function receiptRow(label: string, value: string, y: number): string {
  return `<text x="110" y="${y}" class="label">${escapeXml(label)}</text><text x="1090" y="${y}" class="value" text-anchor="end">${escapeXml(value)}</text>`;
}

export function renderShareReceiptSvg(data: ShareReceiptData): string {
  const rows = [
    ['CONVERSATION', data.conversation],
    ['ESTIMATED TOKENS', data.estimatedTokens],
    ['CURRENT MODEL', data.currentModel],
    ['ESTIMATED COST', data.estimatedCost],
    ['ALTERNATIVE', data.alternativeModel],
    ['ALTERNATIVE COST', data.alternativeCost],
  ] as const;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500" role="img" aria-labelledby="title description">
<title id="title">PromptSpend AI receipt</title><desc id="description">Shareable estimate for an AI conversation</desc>
<rect width="1200" height="1500" fill="#11151c"/><rect x="54" y="54" width="1092" height="1392" rx="20" fill="#fbfaf7"/>
<rect x="54" y="54" width="1092" height="22" rx="11" fill="#6d4aff"/>
<style>.brand{font:700 42px Arial,sans-serif;letter-spacing:-1px;fill:#6d4aff}.eyebrow{font:700 22px monospace;letter-spacing:5px;fill:#6d4aff}.heading{font:700 76px Arial,sans-serif;letter-spacing:-3px;fill:#171a21}.label{font:700 23px monospace;letter-spacing:1px;fill:#666b76}.value{font:700 27px Arial,sans-serif;fill:#171a21}.difference{font:700 82px Arial,sans-serif;letter-spacing:-3px;fill:#6d4aff}.note{font:24px Arial,sans-serif;fill:#666b76}.url{font:700 25px monospace;letter-spacing:2px;fill:#171a21}</style>
<text x="110" y="155" class="brand">PROMPTSPEND</text><text x="110" y="232" class="eyebrow">YOUR AI RECEIPT</text>
<text x="110" y="330" class="heading">YOUR PROMPT</text><text x="110" y="410" class="heading">HAS A PRICE TAG.</text>
<line x1="110" x2="1090" y1="480" y2="480" stroke="#a8a8aa" stroke-width="2" stroke-dasharray="10 10"/>
${rows.map(([label, value], index) => receiptRow(label, value, 555 + index * 92)).join('')}
<line x1="110" x2="1090" y1="1105" y2="1105" stroke="#a8a8aa" stroke-width="2" stroke-dasharray="10 10"/>
<text x="110" y="1172" class="eyebrow">PRICE DIFFERENCE</text><text x="110" y="1260" class="difference">${escapeXml(data.priceDifference)}</text>
<text x="110" y="1332" class="note">${escapeXml(data.note)}</text><text x="110" y="1390" class="url">PROMPTSPEND.COM</text>
</svg>`;
}

export function shareReceiptFilename(): string {
  return `promptspend-ai-receipt-${new Date().toISOString().slice(0, 10)}.png`;
}
