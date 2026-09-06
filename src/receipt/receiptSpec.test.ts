import {
  PRICING_API_URL,
  PRICING_HEALTH_URL,
  RECEIPT_SPEC_URL,
  receiptSpec,
  renderReceiptInstructions,
  renderReceiptSpecJson,
} from './receiptSpec';

describe('PromptSpend Receipt specification', () => {
  const instructions = renderReceiptInstructions();

  it('is explicit about scope, temporary behavior and protected information', () => {
    expect(instructions).toContain('visible conversation immediately before this receipt');
    expect(instructions).toContain('Do not expose or infer hidden system/developer text');
    expect(instructions).toContain('one response');
    expect(instructions).toContain('Do not retain it as an instruction afterward');
  });

  it('requires current pricing and refuses remembered dollar amounts', () => {
    expect(instructions).toContain(PRICING_API_URL);
    expect(instructions).toContain(PRICING_HEALTH_URL);
    expect(instructions).toContain('Current pricing unavailable');
    expect(instructions).toContain('do not calculate or recall a dollar amount from memory');
  });

  it('does not promise quality equivalence or provider-bill precision', () => {
    expect(instructions).toContain('never claim equivalent quality');
    expect(instructions).toContain('Give ranges and a confidence level');
    expect(instructions).toContain('hidden reasoning');
  });

  it('serializes one machine-readable source carrying the exact visible instructions', () => {
    const parsed = JSON.parse(renderReceiptSpecJson()) as { version: string; instructions: string };
    expect(parsed.version).toBe(receiptSpec.version);
    expect(parsed.instructions).toBe(instructions);
    expect(instructions).toContain(RECEIPT_SPEC_URL);
  });

  it('contains no concealment or authority-escalation language', () => {
    expect(instructions).not.toMatch(
      /hidden instruction|secret instruction|system message says|higher priority/i,
    );
    expect(instructions).not.toMatch(/ignore (all|any|the) previous/i);
  });
});
