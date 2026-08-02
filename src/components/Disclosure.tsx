import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Small explanations that are actually reachable.
 *
 * These used to be `title` attributes on a `<span>`. A `title` never appears on
 * a touch device, cannot be focused with a keyboard, and is announced
 * inconsistently by screen readers — so the explanation existed only for people
 * using a mouse on a desktop. A real button with a real popover works
 * everywhere, and costs one element.
 */
interface HelpTipProps {
  /** What is being explained, for the button's accessible name. */
  label: string;
  children: ReactNode;
}

export function HelpTip({ label, children }: HelpTipProps) {
  const { open, setOpen, ref } = useDismissable();
  const id = useId();

  return (
    <span className="hint-wrap" ref={ref}>
      <button
        type="button"
        className="hint"
        aria-label={`What does “${label}” mean?`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        ?
      </button>
      {open && (
        <span className="hint-pop" id={id} role="note">
          {children}
        </span>
      )}
    </span>
  );
}

/**
 * The CHECK badge. Same problem as above: the reason a row is flagged was in a
 * `title`, which is exactly the audience — someone deciding whether to trust a
 * number — least well served by a mouse-only affordance.
 */
export function ReviewBadge({ note, verifiedUrl }: { note?: string; verifiedUrl?: string }) {
  const { open, setOpen, ref } = useDismissable();
  const id = useId();

  return (
    <span className="hint-wrap" ref={ref}>
      <button
        type="button"
        className="badge badge--review badge--button"
        aria-label="Why this price is flagged"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
      >
        CHECK
      </button>
      {open && (
        <span className="hint-pop" id={id} role="note">
          {note ?? 'Flagged for review.'}
          {verifiedUrl && (
            <>
              {' '}
              <a href={verifiedUrl} target="_blank" rel="noreferrer noopener">
                Vendor page ↗
              </a>
            </>
          )}
        </span>
      )}
    </span>
  );
}

/** Open/close state that closes on Escape or a click elsewhere. */
function useDismissable() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  return { open, setOpen, ref };
}
