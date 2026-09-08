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

export const SHARE_RECEIPT_LIMITS = { field: 90, input: 12_000, note: 180 } as const;
const KEYS = Object.keys(DEFAULT_SHARE_RECEIPT) as (keyof ShareReceiptData)[];

export function parseShareReceipt(input: string): ShareReceiptData {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('Paste the receipt JSON returned by your assistant.');
  if (trimmed.length > SHARE_RECEIPT_LIMITS.input) {
    throw new Error('The pasted result is too long. Copy only the promptspend-receipt JSON block.');
  }
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
      .slice(0, key === 'note' ? SHARE_RECEIPT_LIMITS.note : SHARE_RECEIPT_LIMITS.field);
    if (!normalized) continue;
    output[key] = normalized;
    recognized += 1;
  }
  if (recognized < 4) {
    throw new Error('The JSON is missing receipt fields. Ask the assistant to return the full share block.');
  }
  return output;
}
