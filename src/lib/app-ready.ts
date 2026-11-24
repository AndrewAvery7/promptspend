/**
 * "The estimator has drawn": a one-time signal from the homepage app.
 *
 * Work that is not needed to show the page (Google Analytics' gtag.js, for one)
 * waits for it, so it does not compete with the app's own code and the price
 * download for the phone's network and processor while the headline is still
 * on its way. See `ScriptTiming` in src/lib/analytics/ga.ts.
 */

let ready = false;
const waiting: Array<() => void> = [];

/** Called once the app has rendered its first real view, or its error message. */
export function markAppReady(): void {
  if (ready) return;
  ready = true;
  for (const run of waiting.splice(0)) run();
}

/**
 * Run `task` after the app is ready and the browser has had a chance to paint,
 * or after `fallbackMs` if the app never says so (a stuck download must not
 * keep the task from ever running).
 */
export function afterAppReady(task: () => void, fallbackMs = 5000): void {
  let done = false;
  const runOnce = () => {
    if (done) return;
    done = true;
    task();
  };
  // A frame, then a task: the work starts after the paint that shows the page.
  const afterPaint = () => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(runOnce, 0));
    else setTimeout(runOnce, 0);
  };
  setTimeout(runOnce, fallbackMs);
  if (ready) afterPaint();
  else waiting.push(afterPaint);
}

/** Tests only: forget the signal. */
export function resetAppReadyForTests(): void {
  ready = false;
  waiting.length = 0;
}
