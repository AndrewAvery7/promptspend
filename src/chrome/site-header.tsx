import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { SiteHeader, type SiteHeaderProps } from '@/components/SiteHeader';
import { useAppearance } from '@/state/useAppearance';
import '@/styles/fonts.css';
import '@/styles/tokens.css';
import '@/styles/header.css';

/**
 * Brings the calculator's header to life on the generated pages.
 *
 * Those pages ship with the header already in their HTML - drawn at build time
 * from the same `Header` component, so a visitor without scripts, a crawler and
 * a screen reader all get it. This file is the optional half: it replaces that
 * markup with the live component, which adds the search palette, the accent and
 * canvas picker, the dark-mode switch and the Guided tour link, and keeps the
 * choices in the same three storage keys the calculator uses, so a theme picked
 * on one page is the theme on all of them.
 *
 * What the page needs to know travels on the mount point's `data-` attributes.
 * They are written by `siteHeader()` in `src/lib/seo/render.ts`.
 */

/** Which of the page's `<picture>` badges to show: the dark ones only in dark mode. */
function syncBadgeArtwork(theme: 'light' | 'dark'): void {
  for (const source of document.querySelectorAll<HTMLSourceElement>('picture source[media]')) {
    // Remember which sources are the dark artwork, because rewriting `media`
    // below removes the words that identified them.
    if (source.getAttribute('media')?.includes('prefers-color-scheme')) source.dataset.darkArtwork = '1';
    if (!source.dataset.darkArtwork) continue;
    // `all` always matches, `not all` never does: the choice follows the
    // visitor's switch rather than their operating system's setting.
    source.setAttribute('media', theme === 'dark' ? 'all' : 'not all');
  }
}

function SiteHeaderIsland(props: Omit<SiteHeaderProps, 'appearance'>) {
  const appearance = useAppearance();
  useEffect(() => syncBadgeArtwork(appearance.theme), [appearance.theme]);
  return <SiteHeader {...props} appearance={appearance} />;
}

/** Read the mount point's data attributes and draw the header into it. */
export function mountSiteHeader(mount: HTMLElement): void {
  const { base, current, pricesChanged, sourcesChecked, degraded, unknown } = mount.dataset;
  createRoot(mount).render(
    <StrictMode>
      <SiteHeaderIsland
        base={base ?? '/'}
        current={current === 'receipt' || current === 'freeTiers' ? current : undefined}
        freshness={
          unknown === '1'
            ? null
            : {
                pricesChangedOn: pricesChanged || null,
                sourcesCheckedOn: sourcesChecked || null,
                degraded: degraded === '1',
              }
        }
      />
    </StrictMode>,
  );
}

const mount = document.getElementById('site-header');
if (mount) mountSiteHeader(mount);
