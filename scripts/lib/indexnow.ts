/**
 * IndexNow: tell search engines a URL changed, instead of waiting to be crawled.
 *
 * Bing, Yandex, Seznam and Naver share one IndexNow pool — submitting to any of
 * them notifies all of them. **Google does not participate.** That is worth
 * saying plainly rather than implying, because "we ping search engines on every
 * price change" reads as though it covers the one that matters most. It does
 * not. Google finds these pages through the sitemap and ordinary crawling; what
 * this buys is same-day freshness on Bing, which in turn feeds ChatGPT's
 * browsing — a genuinely relevant surface for a developer tool.
 *
 * The protocol is deliberately trivial: prove you control the host by serving
 * the key as plain text at its root, then POST a list of URLs.
 */

/**
 * The IndexNow key for promptspend.com.
 *
 * **Public by design.** The whole verification model is that this value is
 * readable at https://promptspend.com/<key>.txt — it proves control of the host
 * and authorises nothing else. Committing it is correct; hiding it in a secret
 * would only mean the key file and the submissions could drift apart.
 */
export const INDEXNOW_KEY = '14a148f330e156c29b9b75cdaf341a0e';

/** Where the proof-of-control file has to live, relative to the site root. */
export const INDEXNOW_KEY_FILE = `${INDEXNOW_KEY}.txt`;

/** Any participating endpoint notifies the whole pool. */
const ENDPOINT = 'https://api.indexnow.org/indexnow';

/** IndexNow rejects a batch over 10,000 URLs. */
const MAX_URLS = 10_000;

export interface SubmitResult {
  status: number;
  submitted: number;
  body: string;
}

/**
 * Submit a batch of URLs for one host.
 *
 * Every URL must be on `host` — IndexNow rejects the whole batch otherwise,
 * which is a confusing way to find out about one bad entry, so it is checked
 * here first.
 */
export async function submitUrls(
  host: string,
  urls: readonly string[],
  fetchImpl: typeof fetch = fetch,
): Promise<SubmitResult> {
  const unique = [...new Set(urls)];
  const foreign = unique.filter((url) => new URL(url).host !== host);
  if (foreign.length > 0) {
    throw new Error(`IndexNow batch mixes hosts: ${foreign.slice(0, 3).join(', ')} is not on ${host}`);
  }
  if (unique.length === 0) throw new Error('IndexNow batch is empty.');
  if (unique.length > MAX_URLS) {
    throw new Error(`IndexNow accepts at most ${MAX_URLS} URLs; got ${unique.length}.`);
  }

  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host,
      key: INDEXNOW_KEY,
      keyLocation: `https://${host}/${INDEXNOW_KEY_FILE}`,
      urlList: unique,
    }),
  });

  return { status: response.status, submitted: unique.length, body: (await response.text()).slice(0, 500) };
}
