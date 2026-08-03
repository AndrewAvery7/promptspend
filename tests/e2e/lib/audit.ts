import type { Page } from '@playwright/test';

/**
 * The four things that actually break a page on a phone.
 *
 * Each returns a list of offenders rather than a boolean, because "the page has
 * horizontal scroll" is not a bug report — "the rate table is 512px wide inside
 * a 320px viewport" is. A failing check should name the element you have to go
 * and fix.
 */

export interface Offender {
  selector: string;
  detail: string;
}

/** A short, human-recognisable selector for an element. */
const DESCRIBE = `(el) => {
  const id = el.id ? '#' + el.id : '';
  const cls = typeof el.className === 'string' && el.className
    ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
    : '';
  return el.tagName.toLowerCase() + id + cls;
}`;

/**
 * Nothing may push the page sideways.
 *
 * The single most common mobile defect, and invisible on a desktop: a table or
 * a long unbroken string widens the document, every section gets a horizontal
 * scrollbar, and the layout looks broken in a way no unit test can see.
 */
export async function horizontalOverflow(page: Page): Promise<Offender[]> {
  return page.evaluate(`(() => {
    const describe = ${DESCRIBE};
    const limit = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth <= limit + 1) return [];

    // Report the widest offenders, not every descendant of one.
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right <= limit + 1 && rect.left >= -1) continue;
      // Skip anything inside a container that legitimately scrolls itself.
      let scrolls = false;
      for (let n = el.parentElement; n; n = n.parentElement) {
        const overflow = getComputedStyle(n).overflowX;
        if (overflow === 'auto' || overflow === 'scroll' || overflow === 'hidden') { scrolls = true; break; }
      }
      if (scrolls) continue;
      out.push({
        selector: describe(el),
        detail: Math.round(rect.width) + 'px wide, extends to x=' + Math.round(rect.right) + ' in a ' + limit + 'px viewport',
      });
    }
    return out.slice(0, 8);
  })()`);
}

/**
 * Anything you tap has to be big enough to tap.
 *
 * 44px is the figure both Apple and the WCAG 2.2 target-size guidance land on.
 * The rules that enforce it live behind `@media (pointer: coarse)`, so this
 * check is only meaningful on a context created with `hasTouch`.
 */
export async function smallTouchTargets(page: Page, minimum = 44): Promise<Offender[]> {
  return page.evaluate(`(() => {
    const describe = ${DESCRIBE};
    const min = ${minimum};
    const selector = 'button, a[href], input, select, textarea, [role="button"], [role="option"], summary';

    /**
     * The region a finger can actually hit.
     *
     * A checkbox is 16-24px by design and padding it to 44 would look absurd;
     * what you tap is its label, and tapping anywhere in that label toggles it.
     * So the target is the union of the control and whatever label drives it —
     * measuring the bare input reported every checkbox on the site as a defect
     * when the real target was a full-width 44px row.
     */
    const target = (el) => {
      const rects = [el.getBoundingClientRect()];
      const wrapping = el.closest('label');
      if (wrapping) rects.push(wrapping.getBoundingClientRect());
      if (el.id) {
        const bound = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (bound) rects.push(bound.getBoundingClientRect());
      }
      return {
        width: Math.max(...rects.map((r) => r.width)),
        height: Math.max(...rects.map((r) => r.height)),
      };
    };

    const out = [];
    for (const el of document.querySelectorAll(selector)) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      const rect = target(el);
      if (rect.width === 0 || rect.height === 0) continue;
      // WCAG exempts a target whose position is determined by the flow of
      // surrounding text, and padding those to 44px would wreck the prose. The
      // test is the actual condition — an inline box in a parent that has words
      // of its own — not a guess at which tags prose lives in. The footer is a
      // run of text in a <div>, and a tag list missed it.
      if (el.tagName === 'A' && style.display.startsWith('inline')) {
        const parent = el.parentElement;
        const around = parent ? parent.textContent.replace(el.textContent, '').trim() : '';
        if (around.length > 0) continue;
      }
      if (rect.height + 0.5 < min || rect.width + 0.5 < min) {
        out.push({
          selector: describe(el),
          detail: Math.round(rect.width) + '×' + Math.round(rect.height) + ', needs ' + min + '×' + min,
        });
      }
    }
    return out.slice(0, 12);
  })()`);
}

/** Nothing readable may render below 12px. */
export async function tinyText(page: Page, minimum = 12): Promise<Offender[]> {
  return page.evaluate(`(() => {
    const describe = ${DESCRIBE};
    const min = ${minimum};
    const out = [];
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const text = (node.textContent || '').trim();
      if (text.length < 3) continue;
      const el = node.parentElement;
      if (!el) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      // Visually-hidden text is for screen readers and is never rendered.
      const rect = el.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      const size = parseFloat(style.fontSize);
      if (size + 0.01 >= min) continue;
      const key = describe(el) + size;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ selector: describe(el), detail: size.toFixed(1) + 'px: "' + text.slice(0, 32) + '"' });
    }
    return out.slice(0, 10);
  })()`);
}

/** Render `Offender[]` as something readable in a test failure. */
export function report(kind: string, offenders: Offender[]): string {
  return [`${offenders.length} ${kind}:`, ...offenders.map((o) => `  ${o.selector} — ${o.detail}`)].join(
    '\n',
  );
}
