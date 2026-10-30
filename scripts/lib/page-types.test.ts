import { describe, expect, it } from 'vitest';
import { declaredPageType, pageTypeProblems } from './page-types';

const typed = (type: string) => `<head><meta name="ps:page-type" content="${type}" /></head>`;

describe('pageTypeProblems', () => {
  it('passes pages that each declare the type their address stands for', () => {
    expect(
      pageTypeProblems([
        { file: 'index.html', html: typed('home') },
        { file: 'models/gpt-5/index.html', html: typed('model') },
        { file: 'compare/index.html', html: typed('hub') },
        { file: '404.html', html: typed('not-found') },
      ]),
    ).toEqual([]);
  });

  it('fails a page with no type', () => {
    expect(pageTypeProblems([{ file: 'data/index.html', html: '<head></head>' }])).toEqual([
      'data/index.html declares no page type (<meta name="ps:page-type">)',
    ]);
  });

  it('fails an unknown type and the fallback "other"', () => {
    expect(pageTypeProblems([{ file: 'about/index.html', html: typed('blog') }])).toHaveLength(1);
    expect(pageTypeProblems([{ file: 'about/index.html', html: typed('other') }])).toHaveLength(1);
  });

  it('fails a type its address does not stand for', () => {
    expect(pageTypeProblems([{ file: 'providers/openai/index.html', html: typed('model') }])).toEqual([
      'providers/openai/index.html declares page type "model" but its address stands for "provider"',
    ]);
  });

  it('skips only the two files that load no analytics', () => {
    expect(
      pageTypeProblems([
        { file: 'estimate/index.html', html: '' },
        { file: 'mobile-turnstile.html', html: '' },
      ]),
    ).toEqual([]);
  });

  it('reads the tag the renderer writes', () => {
    expect(declaredPageType(typed('free-tier'))).toBe('free-tier');
    expect(declaredPageType('<meta name="description" content="x" />')).toBeNull();
  });
});
