import {
  ANDROID_ROBOT_CREDIT,
  APP_STORE_BADGE,
  APP_STORE_URL,
  GOOGLE_PLAY_BADGE,
  GOOGLE_PLAY_URL,
  QR_ANDROID,
  QR_IOS,
} from '@/config';

/**
 * The two official store badges, in one place so every screen that offers the
 * apps offers them the same way.
 *
 * Both are the stores' own unmodified artwork (Google's with its transparent
 * margin trimmed so the two sit at one height). Both companies allow their
 * badge only as a link to a live listing, which is why these did not exist
 * until the listings did.
 */
export function StoreBadges() {
  return (
    <div className="store-badges">
      <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
        <img src={APP_STORE_BADGE} alt="Download on the App Store" width={120} height={40} />
      </a>
      <a href={GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer">
        <img src={GOOGLE_PLAY_BADGE} alt="Get it on Google Play" width={134} height={40} />
      </a>
    </div>
  );
}

/**
 * One QR code per store, for a visitor on a computer with a phone in reach.
 *
 * Hidden by CSS wherever the page is probably already on a phone — a narrow
 * viewport or no hovering pointer — because a code you are holding cannot be
 * scanned. The Android robot's attribution travels with it, as Google's
 * licence requires.
 */
export function StoreQrCodes({ credit = true }: { credit?: boolean }) {
  return (
    <div className="store-qr">
      <a className="store-qr__code" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
        <img src={QR_IOS} alt="QR code: PromptSpend on the App Store" width={92} height={92} />
        <span>iPhone</span>
      </a>
      <a className="store-qr__code" href={GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer">
        <img src={QR_ANDROID} alt="QR code: PromptSpend on Google Play" width={92} height={92} />
        <span>Android</span>
      </a>
      {credit && <p className="store-qr__credit">{ANDROID_ROBOT_CREDIT}</p>}
    </div>
  );
}
