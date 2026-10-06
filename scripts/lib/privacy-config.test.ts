import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The logging settings the privacy policy describes, held to what the
 * deployment configuration actually says.
 *
 * The policy tells visitors which services keep request logs and which do not.
 * Those are one-line settings in three wrangler files, and nothing else would
 * notice if somebody turned one back on while debugging: the Worker would
 * start recording alert links, private tokens included, and the policy would
 * keep saying it did not. If a test here fails, change the setting back, or
 * change the privacy page and the README in the same commit.
 */
const read = (relative: string): string => readFileSync(resolve(__dirname, '../..', relative), 'utf8');

describe('the logging settings the privacy policy describes', () => {
  it('keeps per-request logs off on the alerts Worker, whose links carry private tokens', () => {
    expect(read('worker/wrangler.jsonc')).toMatch(/"invocation_logs":\s*false/);
  });

  it('keeps all logging off on the update server', () => {
    const config = read('updates/wrangler.jsonc');
    expect(config).toMatch(/"observability":\s*\{\s*"enabled":\s*false/);
    expect(config).toMatch(/"logpush":\s*false/);
  });

  it('leaves request logs on for the pricing API, which has no secrets in its addresses', () => {
    expect(read('api/wrangler.jsonc')).toMatch(/"observability":\s*\{\s*"enabled":\s*true\s*\}/);
  });

  it('says so on the privacy page', () => {
    const policy = read('src/content/information/privacy.md');
    expect(policy).toContain("alert service's per-request logging is switched off");
    expect(policy).toContain("has Cloudflare's request logging switched on");
    expect(policy).toContain("the update server's logging is switched off");
  });
});
