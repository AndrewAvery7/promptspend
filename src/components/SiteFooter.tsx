import {
  ANDROID_ROBOT_CREDIT,
  APP_PAGE_URL,
  COMPARE_INDEX_URL,
  FREE_TIERS_URL,
  CONTACT_EMAIL,
  CHANGES_PAGE_URL,
  TOKEN_COUNTER_URL,
  DATA_PAGE_URL,
  DEVELOPER_HUB_URL,
  FAZIER_BADGE_DARK,
  FAZIER_BADGE_LIGHT,
  FAZIER_URL,
  LAUNCHNEST_BADGE_DARK,
  LAUNCHNEST_BADGE_LIGHT,
  LAUNCHNEST_URL,
  MCP_PACKAGE_URL,
  MCPSERVERS_BADGE,
  MCPSERVERS_URL,
  MODELS_INDEX_URL,
  PRIVACY_URL,
  OPEN_VSX_URL,
  PEERLIST_BADGE_DARK,
  PEERLIST_BADGE_LIGHT,
  PEERLIST_URL,
  PEERPUSH_BADGE,
  PEERPUSH_URL,
  PRODUCTHUNT_BADGE_DARK,
  PRODUCTHUNT_BADGE_LIGHT,
  PRODUCTHUNT_URL,
  PROVIDERS_INDEX_URL,
  REPO_URL,
  SWB_BADGE_DARK,
  SWB_BADGE_LIGHT,
  SUPPORT_URL,
  SWB_URL,
  UNEED_BADGE_DARK,
  UNEED_BADGE_LIGHT,
  UNEED_URL,
  VSCODE_MARKETPLACE_URL,
  WRITING_INDEX_URL,
} from '@/config';
import { NAV_LABELS } from '@/lib/links';
import { StoreBadges, StoreQrCodes } from '@/components/StoreBadges';
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
 * Top to bottom: the apps band, the links in four headed columns beside the
 * name, one labeled row of directory badges, and a quiet last line with the
 * license and the catalog's counts. The generated pages (`layout` in
 * `seo/render.ts`) draw the same thing in the same order;
 * `SiteChrome.test.tsx` fails if the two drift.
 *
 * `catalog` is nullable because the Receipt page renders while its catalog is
 * still loading. The counts are the only part that needs it, so the rest of
 * the footer is there from the first paint rather than popping in late.
 */
export function SiteFooter({ catalog, theme }: { catalog: Catalog | null; theme: Theme }) {
  const external = { target: '_blank', rel: 'noreferrer noopener' } as const;
  return (
    <footer className="footer">
      <div className="footer__inner">
        {/* The apps, on every page, in one slim row: the pitch, the store
            badges and, on a computer, the QR codes. The launch banner can be
            dismissed; this cannot. The robot's credit travels with its code. */}
        <section className="footer__apps" aria-labelledby="footer-apps-title">
          <div className="footer__apps-text">
            <p className="footer__apps-title" id="footer-apps-title">
              PromptSpend on iPhone and Android
            </p>
            <p className="footer__apps-sub">
              The same catalog, sources and dates, built for a phone. Free, no account, no ads.
            </p>
          </div>
          <StoreBadges />
          <StoreQrCodes credit={false} />
          <p className="footer__apps-credit">{ANDROID_ROBOT_CREDIT}</p>
        </section>
        <div className="footer__cols">
          <div className="footer__brand">
            <p className="footer__brand-name">PromptSpend</p>
            <p>LLM API prices that show their work. Open source, no accounts, no ads.</p>
            <a className="footer__gh" href={REPO_URL}>
              Star it on GitHub
            </a>
          </div>
          <nav className="footer__col" aria-labelledby="footer-col-prices">
            <h2 id="footer-col-prices">Prices</h2>
            <ul>
              <li>
                <a href={MODELS_INDEX_URL}>All model prices</a>
              </li>
              <li>
                <a href={PROVIDERS_INDEX_URL}>By provider</a>
              </li>
              <li>
                <a href={FREE_TIERS_URL}>{NAV_LABELS.freeTiers}</a>
              </li>
              <li>
                <a href={CHANGES_PAGE_URL}>Price changes</a>
              </li>
            </ul>
          </nav>
          <nav className="footer__col" aria-labelledby="footer-col-tools">
            <h2 id="footer-col-tools">Tools</h2>
            <ul>
              <li>
                <a href={COMPARE_INDEX_URL}>Comparisons</a>
              </li>
              <li>
                <a href={TOKEN_COUNTER_URL}>Token counter</a>
              </li>
              <li>
                <a href={DEVELOPER_HUB_URL}>Pricing API</a>
              </li>
              <li>
                <a href={DATA_PAGE_URL}>Open data</a>
              </li>
            </ul>
          </nav>
          {/* The places this catalog answers that are not a web page. The
              footer is on every view, so it is where somebody who never opens
              Data & Alerts finds out they exist. */}
          <nav className="footer__col" aria-labelledby="footer-col-elsewhere">
            <h2 id="footer-col-elsewhere">Use it elsewhere</h2>
            <ul>
              <li>
                <a href={APP_PAGE_URL}>iPhone &amp; Android apps</a>
              </li>
              <li>
                <a href={MCP_PACKAGE_URL} {...external}>
                  MCP server
                </a>
              </li>
              <li>
                <a href={VSCODE_MARKETPLACE_URL} {...external}>
                  VS Code extension
                </a>
              </li>
              <li>
                <a href={OPEN_VSX_URL} {...external}>
                  Open VSX
                </a>
              </li>
            </ul>
          </nav>
          <nav className="footer__col" aria-labelledby="footer-col-about">
            <h2 id="footer-col-about">About</h2>
            <ul>
              <li>
                <a href={WRITING_INDEX_URL}>Writing</a>
              </li>
              <li>
                <a href={SUPPORT_URL}>Support</a>
              </li>
              <li>
                <a href={PRIVACY_URL}>Privacy</a>
              </li>
              {/* The U.S. opt-out of Google's advertising use, on every page now
                  that there is no notice: the privacy page's on/off control. */}
              <li>
                <a href={`${PRIVACY_URL}#analytics-choice`}>Your privacy choices</a>
              </li>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </li>
            </ul>
          </nav>
        </div>
        {/* The directory listings' price: a link back, on a page they can
            fetch. One labeled row at one height, a two-column grid on a phone.
            The artwork is served from here, not from theirs - see
            `SWB_BADGE_LIGHT` in `@/config` for why. LaunchNest's and Fazier's
            links are also in `index.html`, for verifiers that do not run this
            code. */}
        <div className="footer__badge">
          <span className="footer__listed">Listed on</span>
          <a href={SWB_URL} target="_blank" rel="noopener noreferrer">
            <img
              src={theme === 'dark' ? SWB_BADGE_DARK : SWB_BADGE_LIGHT}
              alt="Listed on Sell With boost"
              width={104}
              height={40}
            />
          </a>
          <a href={PEERPUSH_URL} target="_blank" rel="noopener noreferrer">
            <img src={PEERPUSH_BADGE} alt="PromptSpend on PeerPush" width={142} height={40} />
          </a>
          <a href={PEERLIST_URL} target="_blank" rel="noopener noreferrer">
            <img
              src={theme === 'dark' ? PEERLIST_BADGE_DARK : PEERLIST_BADGE_LIGHT}
              alt="PromptSpend on Peerlist"
              width={136}
              height={40}
            />
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
          <a href={MCPSERVERS_URL} target="_blank" rel="noopener noreferrer">
            <img
              className="footer__badge-strip"
              src={MCPSERVERS_BADGE}
              alt="PromptSpend listed on mcpservers.org"
              width={228}
              height={28}
            />
          </a>
        </div>
        <div className="footer__legal">
          <span>PromptSpend · open source under the MIT license · no accounts, no ads</span>
          {catalog && (
            <span className="footer__stats">
              {catalog.primaryModels.length} models · prices last changed{' '}
              {catalog.pricesLastChanged() ?? 'no change recorded since tracking began'}
              {catalog.sourcesLastChecked() ? ` · sources checked ${catalog.sourcesLastChecked()}` : ''}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
