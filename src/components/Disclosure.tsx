import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

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
  const { anchor, pop, style } = useAnchored(open);
  const id = useId();

  return (
    <span className="hint-wrap" ref={ref}>
      <span className="hint-anchor" ref={anchor}>
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
      </span>
      {open && (
        <span className="hint-pop" id={id} role="note" style={style} ref={pop}>
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
  const { anchor, pop, style } = useAnchored(open);
  const id = useId();

  return (
    <span className="hint-wrap" ref={ref}>
      <span className="hint-anchor" ref={anchor}>
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
      </span>
      {open && (
        <span className="hint-pop" id={id} role="note" style={style} ref={pop}>
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

/**
 * Open/close state that closes on Escape or a click elsewhere — but not on the
 * scrollbar of whatever is holding it.
 *
 * The model picker is a scrolling box. Opening a popover near its bottom edge
 * put half the text out of sight, and the obvious response — grab the scrollbar
 * — counted as "a click elsewhere" and dismissed the thing you were reaching
 * for. The explanation was unreadable by construction for exactly the rows that
 * needed it.
 */
function useDismissable() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // A press on a scrollbar reports coordinates outside the element's
      // content box. That is someone trying to read, not to dismiss.
      if (event.offsetX > target.clientWidth || event.offsetY > target.clientHeight) return;
      if (!ref.current?.contains(target)) setOpen(false);
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

/**
 * Pin a popover to its trigger, in viewport coordinates.
 *
 * `position: absolute` kept it inside the scrolling model picker, which clipped
 * it. Fixed positioning escapes that, at the cost of having to place it by hand
 * and keep it placed while the page moves under it.
 */
function useAnchored(open: boolean) {
  const anchor = useRef<HTMLSpanElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', visibility: 'hidden' });

  // Layout, not plain, effect: placing after paint shows one frame at the
  // previous position every time it reopens. Nothing resets the style on close
  // because nothing needs to — the popover is unmounted while closed, and this
  // runs before the browser paints the reopened one.
  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const trigger = anchor.current?.getBoundingClientRect();
      const self = pop.current?.getBoundingClientRect();
      if (!trigger || !self) return;

      const width = Math.min(320, window.innerWidth * 0.78);
      const left = Math.max(8, Math.min(trigger.left, window.innerWidth - width - 8));

      // Below when it fits, above when it does not — and then clamped into the
      // viewport regardless. The clamp is the part that matters: the trigger
      // can be scrolled out of its own container, and anchoring blindly to an
      // off-screen row put the note off-screen with it.
      const fitsBelow = trigger.bottom + 8 + self.height <= window.innerHeight - 8;
      const preferred = fitsBelow ? trigger.bottom + 8 : trigger.top - 8 - self.height;
      const top = Math.max(8, Math.min(preferred, window.innerHeight - self.height - 8));

      setStyle({ position: 'fixed', top, left, width, visibility: 'visible' });
    };

    place();
    // `true` for capture: the model picker scrolls, not the window, and a
    // scroll event on an inner element does not bubble.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  return { anchor, pop, style };
}
