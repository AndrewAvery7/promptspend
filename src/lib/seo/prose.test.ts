import { describe, expect, it } from 'vitest';
import { parseFrontmatter, renderMarkdown } from './prose';

describe('parseFrontmatter', () => {
  it('splits the --- block into meta fields and leaves the rest as body', () => {
    const { meta, body } = parseFrontmatter(
      '---\nslug: hello-world\ntitle: Hello World\n---\nFirst paragraph.\n',
    );
    expect(meta).toEqual({ slug: 'hello-world', title: 'Hello World' });
    expect(body).toBe('First paragraph.');
  });

  it('refuses a file with no frontmatter block', () => {
    expect(() => parseFrontmatter('Just a paragraph, no --- markers.')).toThrow(/no --- frontmatter block/);
  });

  it('refuses a frontmatter line that is not key: value', () => {
    expect(() => parseFrontmatter('---\nslug hello-world\n---\nbody\n')).toThrow(/not "key: value"/);
  });
});

describe('renderMarkdown', () => {
  it('turns "## " into an h2 and a blank-line-separated block into a paragraph', () => {
    const html = renderMarkdown('## A heading\n\nA paragraph.');
    expect(html).toBe('<h2>A heading</h2>\n<p>A paragraph.</p>');
  });

  it('renders **bold** and `code` spans inside a paragraph', () => {
    expect(renderMarkdown('Some **bold** text and `inline code`.')).toBe(
      '<p>Some <strong>bold</strong> text and <code>inline code</code>.</p>',
    );
  });

  it('renders a fenced code block as <pre><code>, tagged with its language', () => {
    const html = renderMarkdown('```bash\ncurl -s https://promptspend.dev\n```');
    expect(html).toBe('<pre><code class="language-bash">curl -s https://promptspend.dev</code></pre>');
  });

  it('collapses a soft-wrapped paragraph to one line', () => {
    expect(renderMarkdown('Line one\nstill line one.')).toBe('<p>Line one still line one.</p>');
  });

  it('escapes HTML-significant characters in prose, not just in code', () => {
    expect(renderMarkdown('5 < 10 & "quoted"')).toBe('<p>5 &lt; 10 &amp; &quot;quoted&quot;</p>');
  });
});
