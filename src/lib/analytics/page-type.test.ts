import { describe, expect, it } from 'vitest';
import { isPageType, PAGE_TYPES, pageTypeForPath, pageTypeOf } from './page-type';

describe('pageTypeForPath', () => {
  it.each([
    ['/', 'home'],
    ['/index.html', 'home'],
    ['/receipt/', 'receipt'],
    ['/models/', 'hub'],
    ['/models/claude-opus-5/', 'model'],
    ['/providers/', 'hub'],
    ['/providers/openai/', 'provider'],
    ['/compare/', 'hub'],
    ['/compare/gpt-5-vs-claude-opus-5/', 'comparison'],
    ['/free-tiers/', 'hub'],
    ['/providers/google/free/', 'free-tier'],
    ['/providers/google/other/', 'other'],
    ['/writing/', 'hub'],
    ['/writing/what-llm-cost-calculators-get-wrong/', 'article'],
    ['/data/', 'data'],
    ['/changes/', 'changes'],
    ['/token-counter/', 'token-counter'],
    ['/app/', 'app'],
    ['/about/', 'about'],
    ['/corrections/', 'corrections'],
    ['/privacy/', 'privacy'],
    ['/support/', 'support'],
    ['/topics/', 'topics'],
    ['/404.html', 'not-found'],
    ['/somewhere/new/deep/', 'other'],
    ['/unknown/', 'other'],
  ])('%s is %s', (path, type) => {
    expect(pageTypeForPath(path)).toBe(type);
  });

  it('reads past the base path of a project-pages build', () => {
    expect(pageTypeForPath('/promptspend/', '/promptspend/')).toBe('home');
    expect(pageTypeForPath('/promptspend/models/gpt-5/', '/promptspend')).toBe('model');
  });

  it('only ever returns a label from the closed list', () => {
    for (const path of ['/', '/models/x/', '/a/b/c/', '/../..', '/?q=1']) {
      expect(PAGE_TYPES).toContain(pageTypeForPath(path));
    }
  });
});

describe('pageTypeOf', () => {
  const page = (meta: string | null, pathname: string) => {
    document.head.innerHTML = meta === null ? '' : `<meta name="ps:page-type" content="${meta}" />`;
    window.history.replaceState(null, '', pathname);
    return document;
  };

  it('sends the type the page declares', () => {
    expect(pageTypeOf(page('comparison', '/'))).toBe('comparison');
  });

  it('never passes on a declared value that is not on the list', () => {
    expect(pageTypeOf(page('me@example.com', '/models/x/'))).toBe('other');
    expect(isPageType('me@example.com')).toBe(false);
  });

  it('sends `other` when the page declares nothing, whatever its address', () => {
    expect(pageTypeOf(page(null, '/privacy/'))).toBe('other');
    document.head.innerHTML = '';
  });
});
