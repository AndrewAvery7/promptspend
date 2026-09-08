export interface NumericDraftOptions {
  label: string;
  min: number;
  max: number;
  step: number;
}

export type NumericDraftResult =
  | { kind: 'valid'; value: number; message: string | null }
  | { kind: 'invalid' | 'incomplete'; message: string };

/** Bound parsing work, not the visible input: pasted text is never silently truncated. */
export const MAX_NUMERIC_DRAFT_CHARACTERS = 128;

function decimalParts(text: string): { coefficient: bigint; scale: number } {
  const [mantissa, exponentText = '0'] = text.toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const scale = fraction.length - Number(exponentText);
  const coefficient = BigInt(`${whole || '0'}${fraction}`);
  return scale < 0 ? { coefficient: coefficient * 10n ** BigInt(-scale), scale: 0 } : { coefficient, scale };
}

/** Round decimal input without binary floating-point halfway errors (1.15 / 0.1). */
export function roundDecimalToStep(text: string, step: number): number {
  const value = decimalParts(text);
  const interval = decimalParts(String(step));
  const scale = Math.max(value.scale, interval.scale);
  const coefficient = value.coefficient * 10n ** BigInt(scale - value.scale);
  const intervalCoefficient = interval.coefficient * 10n ** BigInt(scale - interval.scale);
  const sign = coefficient < 0n ? -1n : 1n;
  const absolute = coefficient * sign;
  const remainder = absolute % intervalCoefficient;
  const roundsUp = sign > 0n ? remainder * 2n >= intervalCoefficient : remainder * 2n > intervalCoefficient;
  const intervals = absolute / intervalCoefficient + (roundsUp ? 1n : 0n);
  return Number(`${intervals * intervalCoefficient * sign}e-${scale}`);
}

export function parseNumericDraft(text: string, options: NumericDraftOptions): NumericDraftResult {
  const { label, min, max, step } = options;
  if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    return { kind: 'invalid', message: `${label} is unavailable because its input limits are invalid.` };
  }
  if (text.length > MAX_NUMERIC_DRAFT_CHARACTERS) {
    return { kind: 'invalid', message: `${label} is too long. Enter a number between ${min} and ${max}.` };
  }
  const trimmed = text.trim();
  let normalized = trimmed;
  if (step < 1) {
    const groupedDecimal = /^-?\d{1,3}(?:,\d{3})+\.\d+$/.test(trimmed);
    const ambiguousSingleComma = /^-?\d{1,3},\d{3}$/.test(trimmed);
    if (groupedDecimal) {
      normalized = trimmed.replaceAll(',', '');
    } else if (ambiguousSingleComma) {
      return {
        kind: 'invalid',
        message: `${label} is ambiguous. Use 1000 for one thousand or 1.000 for one decimal value.`,
      };
    } else if (/^-?\d+,\d+$/.test(trimmed)) {
      normalized = trimmed.replace(',', '.');
    }
  } else if (/^-?\d{1,3}(?:,\d{3})+$/.test(trimmed)) {
    normalized = trimmed.replaceAll(',', '');
  }
  if (
    normalized === '' ||
    normalized === '-' ||
    normalized === '.' ||
    normalized === '-.' ||
    /^-?\d+\.$/.test(normalized)
  ) {
    return { kind: 'incomplete', message: `Finish entering ${label.toLowerCase()} before continuing.` };
  }
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
    return { kind: 'invalid', message: `${label} must be a number without letters or grouping separators.` };
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return {
      kind: 'invalid',
      message: `${label} must be between ${min} and ${max}. Edit the value to continue.`,
    };
  }
  const value = Math.min(max, Math.max(min, roundDecimalToStep(normalized, step)));
  return {
    kind: 'valid',
    value,
    message: value === parsed ? null : `${label} uses ${value}, rounded to the nearest ${step}.`,
  };
}

interface NumericDraftRegistration {
  isActive: () => boolean;
  validate: () => string | null;
  reveal: (message: string) => void;
  discard?: () => void;
}

const drafts = new Map<symbol, NumericDraftRegistration>();

export class NumericDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NumericDraftValidationError';
  }
}

export function registerNumericDraft(registration: NumericDraftRegistration): () => void {
  const id = Symbol('numeric-draft');
  drafts.set(id, registration);
  return () => {
    drafts.delete(id);
  };
}

/**
 * Run synchronously BEFORE using pricing/scenario props in an action handler.
 * Valid edits already update parent state on change. This boundary never commits
 * asynchronously then lets the caller accidentally read its old React closure.
 */
export function assertNumericDraftsValid(): void {
  for (const draft of drafts.values()) {
    if (!draft.isActive()) continue;
    const message = draft.validate();
    if (message) {
      draft.reveal(message);
      throw new NumericDraftValidationError(message);
    }
  }
}

/** Only for an explicit reset/replace action, never as a way to bypass validation. */
export function discardNumericDrafts(): void {
  for (const draft of drafts.values()) {
    if (draft.isActive()) draft.discard?.();
  }
}
