/**
 * Every page the built site serves declares the kind of page it is, the
 * `page_type` Google Analytics receives (src/lib/analytics/page-type.ts).
 * `npm run check:seo` runs this over every HTML file in `dist/`.
 */
import { isPageType, PAGE_TYPE_META, pageTypeForPath } from '../../src/lib/analytics/page-type';

/**
 * HTML files in `dist/` that load no analytics at all, so have no type to
 * declare: the shared-estimate handoff (a redirect) and the apps' Turnstile
 * frame. Both come from `public/` and are copied as they are.
 */
export const UNTYPED_FILES: readonly string[] = ['estimate/index.html', 'mobile-turnstile.html'];

export interface BuiltPage {
  /** The file, relative to `dist/`, with forward slashes: `models/gpt-5/index.html`. */
  file: string;
  html: string;
}

/** The type a page declares, or null if it declares none. */
export function declaredPageType(html: string): string | null {
  const tag = new RegExp(`<meta\\s+name="${PAGE_TYPE_META}"\\s+content="([^"]*)"`).exec(html);
  return tag ? tag[1]! : null;
}

/**
 * One line per page that has no type, an unknown type, the fallback `other`,
 * or a type its own address does not stand for (so the type a page declares
 * and the one the browser would work out from its address cannot drift apart).
 */
export function pageTypeProblems(pages: readonly BuiltPage[]): string[] {
  const problems: string[] = [];
  for (const { file, html } of pages) {
    if (UNTYPED_FILES.includes(file)) continue;
    const declared = declaredPageType(html);
    if (declared === null) {
      problems.push(`${file} declares no page type (<meta name="${PAGE_TYPE_META}">)`);
      continue;
    }
    if (!isPageType(declared) || declared === 'other') {
      problems.push(`${file} declares page type "${declared}", which is not on the list`);
      continue;
    }
    const fromAddress = pageTypeForPath(`/${file}`);
    if (fromAddress !== declared) {
      problems.push(`${file} declares page type "${declared}" but its address stands for "${fromAddress}"`);
    }
  }
  return problems;
}
