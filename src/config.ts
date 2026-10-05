export const REPO_URL = 'https://github.com/AndrewAvery7/promptspend';

/**
 * Contact routes. Both are Cloudflare Email Routing aliases, so either can be
 * retired without touching a real inbox address.
 */
export const CONTACT_EMAIL = 'info@promptspend.com';
export const SECURITY_EMAIL = 'security@promptspend.com';

/**
 * Origin of the price-alerts API (the `worker/` project in this repository).
 *
 * Set at build time by `VITE_ALERTS_API`. Empty is a legitimate configuration
 * and the one this site ships with until the API has a domain: the alerts UI
 * detects it and says the feature is not live yet, rather than rendering a form
 * that cannot submit.
 *
 * This is also the value the Content Security Policy opens `connect-src` for —
 * see the `csp` plugin in `vite.config.ts`. Changing it here changes both, and
 * nothing else needs editing.
 */
export const ALERTS_API = (import.meta.env.VITE_ALERTS_API ?? '').replace(/\/+$/, '');

/** Where the published catalog lives, relative to the deployed base path. */
export const PRICING_URL = `${import.meta.env.BASE_URL}data/pricing.json`;

/** The sync health manifest: proof the pipeline ran, separate from its output. */
export const HEALTH_URL = `${import.meta.env.BASE_URL}data/sync-status.json`;

/**
 * The generated, crawlable pages — one per model, provider and comparison.
 *
 * They are built by `scripts/build-pages.ts` after Vite finishes, and they are
 * not part of this bundle. Linking to them from the app matters for two
 * separate reasons: a visitor who wants a permanent URL for one model has one,
 * and a crawler that arrives here can reach all ~160 of them without the
 * sitemap being the only path in.
 */
export const MODELS_INDEX_URL = `${import.meta.env.BASE_URL}models/`;
export const PROVIDERS_INDEX_URL = `${import.meta.env.BASE_URL}providers/`;
export const COMPARE_INDEX_URL = `${import.meta.env.BASE_URL}compare/`;

/** A real multi-page entry, not one of the calculator's client-state views. */
export const RECEIPT_URL = `${import.meta.env.BASE_URL}receipt/`;

/** The public pricing API, served from the .dev developer hub. */
export const DEVELOPER_HUB_URL = 'https://promptspend.dev';

/**
 * The Sell With Boost listing, and the badge that pays for it.
 *
 * That directory approves a listing only once it can fetch a page on this
 * domain carrying a link back to theirs. The artwork is copied into `public/`
 * rather than hot-linked from their CDN, for two reasons that point the same
 * way: `img-src` was `'self' data:` on every surface here (it now also admits
 * launchnest.io, for that badge alone), so their URL would simply be blocked,
 * and a footer that says "no tracking" should not hand a
 * directory the IP of every visitor. Their verifier reads the link, which is
 * unchanged. Both files are self-contained - the mark is a data URI inside the
 * SVG - so neither reaches the network.
 *
 * One edit to their artwork: the opaque plate and its border are removed, so
 * the badge sits on the footer rather than on a white card floating in it. The
 * mark, the wordmark and their colours are untouched.
 */
export const SWB_URL = 'https://sellwithboost.com';
export const SWB_BADGE_LIGHT = `${import.meta.env.BASE_URL}sellwithboost-light.svg`;
export const SWB_BADGE_DARK = `${import.meta.env.BASE_URL}sellwithboost-dark.svg`;

/**
 * The PeerPush listing, and its badge, beside the Sell With Boost one.
 *
 * Self-hosted for the same two reasons as `SWB_BADGE_LIGHT`: their embed
 * snippet hot-links `peerpush.com/p/promptspend/badge.png`, which `img-src
 * 'self'` would block and which would hand them every visitor's IP. The PNG is
 * their official 460x130 artwork, unedited, drawn at 142x40 so it stands the
 * same 40px tall as the Sell With Boost badge. It is a white card with its own
 * border, so one file serves both themes.
 *
 * Their badge is generated on their side and changes with the listing's state
 * (it read "Coming soon - Launching on PeerPush" when copied). This copy does
 * not follow it; refresh `public/peerpush-badge.png` by hand if it matters.
 */
export const PEERPUSH_URL = 'https://peerpush.com/p/promptspend';
export const PEERPUSH_BADGE = `${import.meta.env.BASE_URL}peerpush-badge.png`;

/**
 * The LaunchNest listing, and its badge, after the PeerPush one.
 *
 * The one badge NOT self-hosted. LaunchNest's verifier refused a local copy
 * ("We couldn't find the badge image on that page") and only accepts its own
 * `launchnest.io/badge/promptspend.svg`, so the owner approved, on 2026-10-05,
 * letting `img-src` admit `https://launchnest.io` on every surface that shows
 * the footer, and nothing else. The image is requested with
 * `referrerpolicy="no-referrer"`, so LaunchNest learns a visitor's IP but not
 * which page they were on; their badge sets no cookies. The privacy policy
 * says so under "Network requests". Drawn at 157x40 - their 590x150 card at
 * the same 40px height as the other badges; `&theme=light` is the light card.
 *
 * LaunchNest publishes the listing only once its verifier finds this link on
 * the home page, and the verifier reads the HTML without running JavaScript.
 * So `index.html` carries a copy of this badge inside `#root`, which React
 * replaces with the real footer on mount; keep the two in step. The link must
 * not carry `nofollow`, `sponsored` or `ugc`, or the listing is refused.
 */
export const LAUNCHNEST_URL = 'https://launchnest.io/p/promptspend';
export const LAUNCHNEST_ORIGIN = 'https://launchnest.io';
export const LAUNCHNEST_BADGE_LIGHT = `${LAUNCHNEST_ORIGIN}/badge/promptspend.svg?variant=featured&theme=light`;
export const LAUNCHNEST_BADGE_DARK = `${LAUNCHNEST_ORIGIN}/badge/promptspend.svg?variant=featured`;

/**
 * The Uneed listing, and its badge, after the LaunchNest one.
 *
 * A local copy, like Sell With Boost's and PeerPush's: Uneed has no badge
 * verifier, so nothing needs their hot-linked `uneed.best/EMBED3B.png`, which
 * `img-src` would block and which would hand them every visitor's IP. Both
 * PNGs are their official 582x152 artwork, unedited - `uneed-badge-light.png`
 * is the cream card, `uneed-badge-dark.png` the dark one - drawn at 153x40 to
 * stand the same 40px tall as the other badges. They read "Launching soon on
 * Uneed" as copied; refresh them by hand if the listing's state matters.
 */
export const UNEED_URL = 'https://www.uneed.best/tool/promptspend';
export const UNEED_BADGE_LIGHT = `${import.meta.env.BASE_URL}uneed-badge-light.png`;
export const UNEED_BADGE_DARK = `${import.meta.env.BASE_URL}uneed-badge-dark.png`;

/**
 * The Fazier listing, and its badge, after the Uneed one.
 *
 * A local copy of the badge Fazier's embed hot-links from
 * `fazier.com/api/v1//public/badges/launch_badges.svg`, which `img-src` would
 * block. Both SVGs are their 103x44 "launched" artwork - `fazier-badge-light.svg`
 * for the light theme, `fazier-badge-dark.svg` the dark one - plain paths with
 * no fonts, scripts or outside references, drawn at 94x40 to stand the same
 * 40px tall as the other badges.
 *
 * Fazier's free launch needs this link on the home page, and its verifier
 * probably reads the HTML without running JavaScript, as LaunchNest's does. So
 * `index.html` carries a copy of this badge inside `#root` too; keep the two in
 * step. The link must not carry `nofollow`, `sponsored` or `ugc`.
 */
export const FAZIER_URL = 'https://fazier.com';
export const FAZIER_BADGE_LIGHT = `${import.meta.env.BASE_URL}fazier-badge-light.svg`;
export const FAZIER_BADGE_DARK = `${import.meta.env.BASE_URL}fazier-badge-dark.svg`;

/**
 * The Product Hunt listing, and its badge, after the Fazier one.
 *
 * A local copy of the "featured" badge Product Hunt's embed hot-links from
 * `api.producthunt.com/widgets/embed-image/v1/featured.svg`, which `img-src`
 * would block. Their live upvote counter is removed, so the copy cannot go
 * stale. Both SVGs are 204x54 - `producthunt-badge-light.svg` the white card
 * with red text, `producthunt-badge-dark.svg` the dark one - with no scripts
 * or outside references (the text uses the system Helvetica), drawn at 151x40
 * to stand the same 40px tall as the other badges.
 *
 * Product Hunt has no badge verifier, so unlike LaunchNest's and Fazier's this
 * one is not in `index.html`. The link drops the embed's `?embed=true&utm_...`
 * query string.
 */
export const PRODUCTHUNT_URL = 'https://www.producthunt.com/products/promptspend/launches/promptspend';
export const PRODUCTHUNT_BADGE_LIGHT = `${import.meta.env.BASE_URL}producthunt-badge-light.svg`;
export const PRODUCTHUNT_BADGE_DARK = `${import.meta.env.BASE_URL}producthunt-badge-dark.svg`;

/**
 * Install routes for the two things that are not this website.
 *
 * Defined in `@/lib/links` and re-exported here so components keep importing
 * from one place. They are not declared in this file because `llms.txt` needs
 * them too, and its generator runs under plain Node where the `import.meta.env`
 * reads above would throw.
 */
export {
  APP_STORE_URL,
  GOOGLE_PLAY_URL,
  MCP_INSTALL_COMMAND,
  MCP_PACKAGE_URL,
  OPEN_VSX_URL,
  VSCODE_INSTALL_COMMAND,
  VSCODE_MARKETPLACE_URL,
} from '@/lib/links';

/** The permanent page for both apps, under whatever base path this build uses. */
export const APP_PAGE_URL = `${import.meta.env.BASE_URL}app/`;

/** Store artwork and QR codes, served from `public/store/`. */
export const APP_STORE_BADGE = `${import.meta.env.BASE_URL}store/app-store-badge.svg`;
export const GOOGLE_PLAY_BADGE = `${import.meta.env.BASE_URL}store/google-play-badge.png`;
export const QR_IOS = `${import.meta.env.BASE_URL}store/qr-ios.svg`;
export const QR_ANDROID = `${import.meta.env.BASE_URL}store/qr-android.svg`;

/** Required wherever the Android robot is shown (Google's CC BY 3.0 terms). */
export const ANDROID_ROBOT_CREDIT =
  'The Android robot is reproduced or modified from work created and shared by Google and used according to terms described in the Creative Commons 3.0 Attribution License.';

/**
 * What these numbers cover, stated once and reused wherever the boundary
 * matters. Being specific about the edge of the model is the difference
 * between an estimate and a guess wearing an estimate's clothes.
 */
export const PRICING_SCOPE =
  'Standard-tier, global-endpoint list prices in USD. Regional/data-residency premiums, fast and priority tiers, server-side tool fees and negotiated discounts are not included.';
