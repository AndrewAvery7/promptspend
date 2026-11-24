/**
 * The homepage's pre-drawn top (src/components/HomeShell.tsx) and its mount point.
 *
 * The build writes the tape, header and hero into index.html's #root. If React
 * rendered into #root itself it would throw those nodes away on its first render
 * and draw identical ones, and Google's test dates the page's largest paint
 * from that second drawing: 2.9 s instead of 1.8 s on its phone profile
 * (measured November 2026). So the app renders into a box of its own beside
 * them, shows nothing while the catalog loads, and removes them in the same
 * frame its first full view is drawn, before the browser paints, so the page
 * never shows both or neither.
 */

/** The class of the box the app renders into, beside the pre-drawn nodes. */
export const APP_MOUNT_CLASS = 'app-mount';

let staticNodes: Element[] = [];

/** The pre-drawn hero's faces (the "Shell" families in fonts.css), as `FontFaceSet.load` takes them. */
const SHELL_FACES = [
  "400 16px 'IBM Plex Sans Shell'",
  "600 16px 'IBM Plex Sans Shell'",
  "700 16px 'Space Grotesk Shell'",
];

/**
 * Where the app should render. With a pre-drawn shell in #root, a new box after
 * it (remembering what was there, to remove later); without one, #root itself.
 */
export function appContainer(root: HTMLElement): { container: HTMLElement; hasStaticShell: boolean } {
  if (!root.querySelector(':scope > .home-shell')) return { container: root, hasStaticShell: false };
  staticNodes = [...root.children];
  const mount = root.ownerDocument.createElement('div');
  mount.className = APP_MOUNT_CLASS;
  root.append(mount);
  return { container: mount, hasStaticShell: true };
}

/**
 * Resolves once the browser reports the pre-drawn hero as painted. The app
 * waits for this before replacing it.
 *
 * On a phone the hero is on screen long before the app's code and the price
 * list arrive, so this costs nothing. On a fast connection the app could
 * otherwise replace it before it was ever drawn (its faces are
 * `font-display: block`, fonts.css), and Google's test, which rebuilds a
 * phone's timing from a fast load, then dates the page's largest paint from
 * the app's copy, after all of its code. "Faces loaded" proved not to be
 * "painted" (measured November 2026), so this listens for the paint itself:
 * the browser's largest-contentful-paint report naming an element of the
 * pre-drawn hero. Where that report does not exist (Safari, Firefox), it waits
 * for the faces and two frames. Gives up after `timeoutMs` either way.
 */
export function staticShellPainted(doc: Document = document, timeoutMs = 3000): Promise<void> {
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  const view = doc.defaultView;
  const observable =
    typeof PerformanceObserver !== 'undefined' &&
    (PerformanceObserver.supportedEntryTypes ?? []).includes('largest-contentful-paint');

  const painted = observable
    ? new Promise<void>((resolve) => {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as Array<PerformanceEntry & { element?: Element | null }>) {
            if (entry.element?.closest('.home-shell .hero')) {
              observer.disconnect();
              resolve();
              return;
            }
          }
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
      })
    : (doc.fonts
        ? Promise.all(SHELL_FACES.map((face) => doc.fonts.load(face))).then(() => undefined)
        : Promise.resolve()
      ).then(
        () =>
          new Promise<void>((resolve) => {
            const frame = view?.requestAnimationFrame?.bind(view);
            if (!frame) return void setTimeout(resolve, 0);
            frame(() => frame(() => setTimeout(resolve, 0)));
          }),
      );
  return Promise.race([painted, timeout]);
}

/** Remove the pre-drawn nodes. Call it in a layout effect, so it lands before the next paint. */
export function removeStaticShell(): void {
  for (const node of staticNodes) node.remove();
  staticNodes = [];
}
