import {
  APP_PAGE_URL,
  COMPARE_INDEX_URL,
  CONTACT_EMAIL,
  DEVELOPER_HUB_URL,
  FAZIER_BADGE_DARK,
  FAZIER_BADGE_LIGHT,
  FAZIER_URL,
  LAUNCHNEST_BADGE_DARK,
  LAUNCHNEST_BADGE_LIGHT,
  LAUNCHNEST_URL,
  MCP_PACKAGE_URL,
  MODELS_INDEX_URL,
  OPEN_VSX_URL,
  PEERPUSH_BADGE,
  PEERPUSH_URL,
  PRODUCTHUNT_BADGE_DARK,
  PRODUCTHUNT_BADGE_LIGHT,
  PRODUCTHUNT_URL,
  PROVIDERS_INDEX_URL,
  REPO_URL,
  SWB_BADGE_DARK,
  SWB_BADGE_LIGHT,
  SWB_URL,
  UNEED_BADGE_DARK,
  UNEED_BADGE_LIGHT,
  UNEED_URL,
  VSCODE_MARKETPLACE_URL,
} from '@/config';
import type { Catalog } from '@/lib/pricing/catalog';
import type { Theme } from '@/state/useAppearance';

/**
 * One footer for every screen the site renders in a browser.
 *
 * The Receipt page used to carry a short footer of its own - a single line and
 * two links - which made it read as a separate product from the page before it.
 * Both entry points now render this, so a link added here appears on both and
 * cannot be forgotten on one.
 *
 * `catalog` is nullable because the Receipt page renders while its catalog is
 * still loading. The counts row is the only part that needs it, so the rest of
 * the footer is there from the first paint rather than popping in late.
 */
export function SiteFooter({ catalog, theme }: { catalog: Catalog | null; theme: Theme }) {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div>
          <b>PromptSpend</b> · open source, MIT · no accounts, no tracking ·{' '}
          <a href={REPO_URL}>star it on GitHub</a> · <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </div>
        {/* The generated pages. Every model has a permanent URL of its own —
            useful to link to, and the route by which anything that does not
            run JavaScript can read this catalog at all. */}
        <div>
          <a href={MODELS_INDEX_URL}>All model prices</a> · <a href={PROVIDERS_INDEX_URL}>By provider</a> ·{' '}
          <a href={COMPARE_INDEX_URL}>Comparisons</a> · <a href={DEVELOPER_HUB_URL}>Pricing API</a>
        </div>
        {/* The places this catalog answers that are not a web page. The footer
            is the only row present on every view, so it is where somebody who
            never opens Data & Alerts finds out they exist — and where anyone
            who dismissed the launch banner finds the apps again. */}
        <div>
          <a href={APP_PAGE_URL}>iPhone &amp; Android apps</a> ·{' '}
          <a href={MCP_PACKAGE_URL} target="_blank" rel="noreferrer noopener">
            MCP server
          </a>{' '}
          ·{' '}
          <a href={VSCODE_MARKETPLACE_URL} target="_blank" rel="noreferrer noopener">
            VS Code extension
          </a>{' '}
          ·{' '}
          <a href={OPEN_VSX_URL} target="_blank" rel="noreferrer noopener">
            Open VSX
          </a>
        </div>
        {catalog && (
          <div className="footer__stats">
            {catalog.primaryModels.length} models · prices last changed{' '}
            {catalog.pricesLastChanged() ?? 'no change recorded since tracking began'}
            {catalog.sourcesLastChecked() ? ` · sources checked ${catalog.sourcesLastChecked()}` : ''}
          </div>
        )}
        {/* The directory listings' price: a link back, on a page they can
            fetch. The artwork is served from here, not from theirs - see
            `SWB_BADGE_LIGHT` in `@/config` for why. LaunchNest's and Fazier's
            links are also in `index.html`, for verifiers that do not run this
            code. */}
        <div className="footer__badge">
          <a href={SWB_URL} target="_blank" rel="noopener noreferrer">
            <img
              src={theme === 'dark' ? SWB_BADGE_DARK : SWB_BADGE_LIGHT}
              alt="Listed on Sell With boost"
              width={160}
              height={40}
            />
          </a>
          <a href={PEERPUSH_URL} target="_blank" rel="noopener noreferrer">
            <img src={PEERPUSH_BADGE} alt="PromptSpend on PeerPush" width={142} height={40} />
          </a>
          <a href={LAUNCHNEST_URL} target="_blank" rel="noopener noreferrer">
            <img
              src={theme === 'dark' ? LAUNCHNEST_BADGE_DARK : LAUNCHNEST_BADGE_LIGHT}
              alt="PromptSpend on LaunchNest"
              width={157}
              height={40}
              referrerPolicy="no-referrer"
            />
          </a>
          <a href={UNEED_URL} target="_blank" rel="noopener noreferrer">
            <img
              src={theme === 'dark' ? UNEED_BADGE_DARK : UNEED_BADGE_LIGHT}
              alt="PromptSpend on Uneed"
              width={153}
              height={40}
            />
          </a>
          <a href={FAZIER_URL} target="_blank" rel="noopener noreferrer">
            <img
              src={theme === 'dark' ? FAZIER_BADGE_DARK : FAZIER_BADGE_LIGHT}
              alt="PromptSpend on Fazier"
              width={94}
              height={40}
            />
          </a>
          <a href={PRODUCTHUNT_URL} target="_blank" rel="noopener noreferrer">
            <img
              src={theme === 'dark' ? PRODUCTHUNT_BADGE_DARK : PRODUCTHUNT_BADGE_LIGHT}
              alt="PromptSpend on Product Hunt"
              width={151}
              height={40}
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
