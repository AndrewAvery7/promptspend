import { describe, expect, it } from 'vitest';
import { htmlText, pageContainsQuote, quoteParts, reduceText, stripMarkdownLinks } from './quote';

describe('reduceText', () => {
  it('keeps only lowercase letters and digits', () => {
    expect(reduceText("Free Tier — $1,000/month (it's free)")).toBe('freetier1000monthitsfree');
  });

  it('folds accents so a typographic difference is not a wording change', () => {
    expect(reduceText('Café €20')).toBe('cafe20');
  });
});

describe('htmlText', () => {
  it('drops tags, scripts and styles and decodes the common entities', () => {
    const html =
      '<style>p{}</style><p>Free&nbsp;mode &amp; more &#39;now&#39; &#x2014;</p><script>var x = "no"</script>';
    expect(htmlText(html)).toContain("Free mode & more 'now' —");
    expect(htmlText(html)).not.toContain('var x');
  });
});

describe('pageContainsQuote', () => {
  it('matches a table row quoted with " · " against the markdown it came from', () => {
    const page =
      '| Model | Input | Output |\n| --- | --- | --- |\n| GLM-4.7-Flash | Free | Free | Free | Free |';
    expect(pageContainsQuote(page, 'GLM-4.7-Flash · Free · Free · Free · Free')).toBe(true);
  });

  it('matches the same row rendered as HTML', () => {
    const page = htmlText(
      '<tr><td>GLM-4.7-Flash</td><td>Free</td><td>Free</td><td>Free</td><td>Free</td></tr>',
    );
    expect(pageContainsQuote(page, 'GLM-4.7-Flash · Free · Free · Free · Free')).toBe(true);
  });

  it('reads a sentence that runs through a markdown link', () => {
    const page = 'Access [Billing Page](https://z.ai/manage-apikey/billing) to top up if needed.';
    expect(pageContainsQuote(page, 'Access Billing Page to top up if needed.')).toBe(true);
    expect(stripMarkdownLinks('a [b](https://x.example/y "title") c')).toBe('a [b] c');
  });

  it('ignores curly versus straight quotes and line breaks', () => {
    const page = 'No, the Google Cloud Welcome credit\ncan’t be used towards the Gemini API.';
    expect(
      pageContainsQuote(page, "No, the Google Cloud Welcome credit can't be used towards the Gemini API."),
    ).toBe(true);
  });

  it('fails when a figure changes', () => {
    const page = 'The minimum purchase is $10, and the default amount is $20.';
    expect(pageContainsQuote(page, 'The minimum purchase is $5, and the default amount is $10.')).toBe(false);
  });

  it('fails when the wording is gone', () => {
    expect(
      pageContainsQuote('Our pricing has changed.', 'New users receive a small amount of free credits.'),
    ).toBe(false);
  });

  it('needs every part of an elided quote, in order', () => {
    const page =
      'Limited access to certain models. Free input & output tokens. Content used to improve our products.';
    expect(
      pageContainsQuote(page, 'Limited access to certain models … Content used to improve our products'),
    ).toBe(true);
    expect(
      pageContainsQuote(page, 'Content used to improve our products ... Limited access to certain models'),
    ).toBe(false);
  });

  it('never matches an empty quote', () => {
    expect(quoteParts(' … ')).toEqual([]);
    expect(pageContainsQuote('anything', '')).toBe(false);
  });
});
