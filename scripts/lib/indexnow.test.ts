import { describe, expect, it, vi } from 'vitest';
import { INDEXNOW_KEY, INDEXNOW_KEY_FILE, submitUrls } from './indexnow';

function stubFetch(status = 200, body = 'OK') {
  return vi.fn(async () => new Response(body, { status }));
}

describe('INDEXNOW_KEY', () => {
  it('is the hex string the protocol requires, and names its own key file', () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{8,128}$/);
    expect(INDEXNOW_KEY_FILE).toBe(`${INDEXNOW_KEY}.txt`);
  });
});

describe('submitUrls', () => {
  it('posts the host, the key and where the key can be verified', async () => {
    const fetchImpl = stubFetch();
    await submitUrls('promptspend.com', ['https://promptspend.com/models/gpt-5/'], fetchImpl);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.indexnow.org/indexnow');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      host: 'promptspend.com',
      key: INDEXNOW_KEY,
      keyLocation: `https://promptspend.com/${INDEXNOW_KEY_FILE}`,
      urlList: ['https://promptspend.com/models/gpt-5/'],
    });
  });

  it('deduplicates, because a repeated URL is a wasted submission', async () => {
    const fetchImpl = stubFetch();
    const result = await submitUrls(
      'promptspend.com',
      ['https://promptspend.com/', 'https://promptspend.com/'],
      fetchImpl,
    );
    expect(result.submitted).toBe(1);
  });

  it('refuses a batch that mixes hosts, which IndexNow would reject wholesale', async () => {
    // One foreign URL invalidates the entire submission, so finding out here
    // beats finding out from a 422 that names nothing.
    await expect(
      submitUrls('promptspend.com', ['https://promptspend.com/', 'https://example.com/'], stubFetch()),
    ).rejects.toThrow(/mixes hosts/);
  });

  it('refuses an empty batch', async () => {
    await expect(submitUrls('promptspend.com', [], stubFetch())).rejects.toThrow(/empty/);
  });

  it('refuses a batch past the protocol limit', async () => {
    const urls = Array.from({ length: 10_001 }, (_, i) => `https://promptspend.com/${i}`);
    await expect(submitUrls('promptspend.com', urls, stubFetch())).rejects.toThrow(/at most 10000/);
  });

  it('reports a rejection rather than throwing, so a deploy is not blocked by it', async () => {
    const result = await submitUrls(
      'promptspend.com',
      ['https://promptspend.com/'],
      stubFetch(403, 'Forbidden'),
    );
    expect(result).toMatchObject({ status: 403, submitted: 1, body: 'Forbidden' });
  });
});
