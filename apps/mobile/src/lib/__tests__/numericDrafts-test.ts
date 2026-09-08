import {
  assertNumericDraftsValid,
  NumericDraftValidationError,
  parseNumericDraft,
  registerNumericDraft,
  roundDecimalToStep,
} from '@/lib/numericDrafts';

const options = { label: 'Multiplier', min: 1, max: 5, step: 0.1 };

describe('numeric draft validation', () => {
  test.each([
    ['1.15', 0.1, 1.2],
    ['1.05', 0.1, 1.1],
    ['1.14', 0.1, 1.1],
    ['1.005', 0.01, 1.01],
    ['2.675', 0.01, 2.68],
    ['2.25', 0.5, 2.5],
    ['3.5', 1, 4],
    ['-1.15', 0.1, -1.1],
    ['0.00000015', 1e-7, 0.0000002],
  ])('rounds %s in increments of %s to %s', (text, step, expected) => {
    expect(roundDecimalToStep(text, step)).toBe(expected);
  });

  test.each(['', '.', '1.', '-'])('incomplete input %s cannot reuse a previous value', (text) => {
    expect(parseNumericDraft(text, options).kind).toBe('incomplete');
  });

  test.each(['one', '1e3', '1,000,000', '1.2.3', '-2', '6', '1'.repeat(129)])(
    'rejects %s without stripping or truncating it',
    (text) => {
      expect(parseNumericDraft(text, options).kind).toBe('invalid');
    },
  );

  test('accepts comma decimals and reports rounding without clamping invalid input', () => {
    expect(parseNumericDraft('1,15', options)).toEqual({
      kind: 'valid',
      value: 1.2,
      message: 'Multiplier uses 1.2, rounded to the nearest 0.1.',
    });
    expect(parseNumericDraft('9', options).kind).toBe('invalid');
    expect(parseNumericDraft('1,000', { ...options, min: 0, max: 10000, step: 1 })).toEqual({
      kind: 'valid',
      value: 1000,
      message: null,
    });
    expect(parseNumericDraft('1,5', { ...options, step: 1 }).kind).toBe('invalid');
  });

  test('handles grouped decimals without silently misreading ambiguous comma input', () => {
    expect(parseNumericDraft('1,234.56', { ...options, min: 0, max: 10000 })).toEqual({
      kind: 'valid',
      value: 1234.6,
      message: 'Multiplier uses 1234.6, rounded to the nearest 0.1.',
    });
    expect(parseNumericDraft('1,000', { ...options, min: 0, max: 10000 })).toEqual({
      kind: 'invalid',
      message: 'Multiplier is ambiguous. Use 1000 for one thousand or 1.000 for one decimal value.',
    });
    expect(parseNumericDraft('1.234,56', { ...options, min: 0, max: 10000 }).kind).toBe('invalid');
  });

  test('only active route drafts block actions and unregister removes them', () => {
    const reveal = jest.fn();
    let active = false;
    const unregister = registerNumericDraft({
      isActive: () => active,
      validate: () => 'Finish this field.',
      reveal,
    });
    try {
      expect(() => assertNumericDraftsValid()).not.toThrow();
      active = true;
      expect(() => assertNumericDraftsValid()).toThrow(NumericDraftValidationError);
      expect(reveal).toHaveBeenCalledWith('Finish this field.');
    } finally {
      unregister();
    }
    expect(() => assertNumericDraftsValid()).not.toThrow();
  });
});
