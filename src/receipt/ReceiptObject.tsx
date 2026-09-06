interface ReceiptObjectProps {
  onCopy: () => void;
  copyState: 'idle' | 'copied' | 'failed';
}

const rows = [
  ['MODEL', '?'],
  ['VISIBLE INPUT', '?'],
  ['VISIBLE OUTPUT', '?'],
  ['CONTEXT RE-SENT', '?'],
  ['HIDDEN REASONING', 'UNKNOWN'],
] as const;

export function ReceiptObject({ onCopy, copyState }: ReceiptObjectProps) {
  return (
    <article className="receipt-object" aria-labelledby="receipt-object-title">
      <div className="receipt-object__brand">
        <span className="receipt-object__logo" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 26 26" fill="none">
            <rect x="1.5" y="1.5" width="23" height="23" rx="6" stroke="currentColor" strokeWidth="2" />
            <path
              d="M7 9.5h12M7 13.5h8M7 17.5h10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span>PROMPTSPEND</span>
      </div>

      <p className="receipt-object__kicker">AI COST CHECK</p>
      <h2 id="receipt-object-title">YOUR AI RECEIPT</h2>
      <p className="receipt-object__scope">For the visible conversation immediately before this receipt</p>

      <dl className="receipt-object__rows">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="receipt-object__total">
        <span>TOTAL</span>
        <strong>LET&apos;S FIND OUT.</strong>
      </div>

      <div className="receipt-object__trust" aria-label="Visible instructions, user initiated, one response">
        <span>VISIBLE INSTRUCTIONS</span>
        <span>USER INITIATED</span>
        <span>ONE RESPONSE</span>
      </div>

      <button type="button" className="receipt-object__copy" onClick={onCopy}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
          <path
            d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
        {copyState === 'copied' ? 'RECEIPT COPIED' : 'COPY THE PROMPTSPEND RECEIPT'}
      </button>
      <p className="receipt-object__url">promptspend.com/receipt</p>
    </article>
  );
}
