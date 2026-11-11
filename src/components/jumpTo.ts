/**
 * Move the visitor to a section of the estimator: scroll it into view and put
 * keyboard focus there.
 *
 * Shared by the hero's "Estimate my cost" button and the phone cost bar's "See
 * all costs", so the two cannot drift into different rules.
 *
 * Focus as well as scroll, for the reason App.tsx gives for its own section
 * links: scrolling alone leaves a keyboard user's focus on the control they
 * just pressed — now off screen — and their next Tab carries on from somewhere
 * they cannot see. The target must be focusable (`tabIndex={-1}` on a heading
 * is this codebase's pattern). `preventScroll` because the scroll below owns
 * the movement; without it the browser jumps there first and the smooth
 * scroll has nowhere left to go.
 *
 * `prefers-reduced-motion` is honored here in JavaScript because no CSS rule
 * reaches `scrollIntoView` — the same rule the guided tour follows.
 *
 * Returns false when the target is missing, so a caller wired to an `<a href>`
 * can let the browser's own anchor jump happen instead.
 */
export function jumpTo(id: string): boolean {
  const target = document.getElementById(id);
  if (!target) return false;
  target.focus({ preventScroll: true });

  // `.panel__title`'s fixed 110px scroll margin clears the sticky header on a
  // desktop, but on a 375px phone the header wraps to two rows and is about
  // 218px tall — measured 2026-11-10 — so the heading these buttons exist to
  // show landed underneath it. The header's real height is read at the moment
  // of the jump instead, and handed to the browser as this target's scroll
  // margin, so `scrollIntoView` still does the scrolling. A CSSOM property
  // write, not a `style` attribute, so the page's style policy allows it.
  const header = document.querySelector('.header');
  const headerHeight = header ? header.getBoundingClientRect().height : 0;
  if (headerHeight > 0) target.style.scrollMarginTop = `${Math.ceil(headerHeight) + 12}px`;

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  return true;
}
