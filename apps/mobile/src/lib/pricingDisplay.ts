import { formatRate, rateOn, type Model } from '@promptspend/core';

export interface ModelRateDisplay {
  accessibility: string;
  input: string;
  output: string;
  promoLabel: string | null;
  standardLabel: string | null;
}

export function modelRateDisplay(model: Model, asOf: Date): ModelRateDisplay {
  const input = rateOn(model, 'input', asOf);
  const output = rateOn(model, 'output', asOf);
  const until = input.promo?.until ?? output.promo?.until ?? null;
  const standardLabel = until
    ? `${formatRate(model.pricing.input)} input · ${formatRate(model.pricing.output)} output standard`
    : null;
  const inputLabel = formatRate(input.value ?? model.pricing.input);
  const outputLabel = formatRate(output.value ?? model.pricing.output);
  return {
    accessibility: `${inputLabel} per million input tokens and ${outputLabel} per million output tokens${until ? `. Intro price through ${until}; standard rates are ${formatRate(model.pricing.input)} input and ${formatRate(model.pricing.output)} output` : ''}`,
    input: inputLabel,
    output: outputLabel,
    promoLabel: until ? `INTRO PRICE · through ${until}` : null,
    standardLabel,
  };
}
