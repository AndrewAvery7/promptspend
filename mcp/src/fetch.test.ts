/**
 * The real `fetch` path, against a real server.
 *
 * tools.test.ts builds a `Catalog` in-process and hands it to the tools, which
 * is right for testing the pricing logic and wrong as the whole story: it meant
 * the one function that actually talks to a network was never executed. The
 * failure that cost a debugging session — the catalog URL transiently serving
 * the site's own `index.html` instead of JSON — lived entirely inside the
 * untested part.
 *
 * A loopback server rather than the live site, so the suite stays offline-safe
 * and deterministic while still exercising fetch, headers, parsing and
 * validation. (`check:startup` is where a real network hit belongs, and it is
 * already there.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CatalogUnavailableError, clearCatalogCache, fetchCatalog, getCatalog } from './catalog';

const REAL_CATALOG = readFileSync(resolve(import.meta.dirname, '../../public/data/pricing.json'), 'utf8');
const PARSED_CATALOG = JSON.parse(REAL_CATALOG) as { generatedAt: string };

/** What the next request will be answered with. */
let respond: (send: (status: number, contentType: string, body: string) => void) => void;

let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((_req, res) => {
    respond((status, contentType, body) => {
      res.writeHead(status, { 'content-type': contentType });
      res.end(body);
    });
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('server did not bind a port');
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

beforeEach(() => clearCatalogCache());

describe('a well-behaved server', () => {
  it('fetches, parses and validates the catalog', async () => {
    respond = (send) => send(200, 'application/json; charset=utf-8', REAL_CATALOG);
    const catalog = await fetchCatalog(`${base}/data/pricing.json`);
    expect(catalog.models.length).toBeGreaterThan(0);
    expect(catalog.generatedAt).toBeTruthy();
  });
});

describe('the failure that started all this', () => {
  it('names HTML for what it is instead of reporting a JSON syntax error', async () => {
    // Verbatim shape of the real incident: the catalog path served the site's
    // own page. `response.json()` would say `Unexpected token '<'`, which is
    // true and tells nobody that a web page arrived where a catalog should —
    // least of all a model relaying the error to whoever asked for a price.
    respond = (send) =>
      send(200, 'text/html; charset=utf-8', '<!doctype html><html><body>PromptSpend</body></html>');

    await expect(fetchCatalog(`${base}/data/pricing.json`)).rejects.toThrow(/Expected JSON/);
    await expect(fetchCatalog(`${base}/data/pricing.json`)).rejects.toThrow(/text\/html/);
    // The status matters as much as the type: it is what separates "the origin
    // 404d and something rendered an error page" from "the origin answered 200
    // with the wrong body". The message that started this recorded neither.
    await expect(fetchCatalog(`${base}/data/pricing.json`)).rejects.toThrow(/HTTP 200/);
    await expect(fetchCatalog(`${base}/data/pricing.json`)).rejects.toThrow(/<!doctype html>/);
  });

  it('retries, so one bad response does not empty the tool call', async () => {
    // The shape the real failure had: one bad response, then a good one. That
    // it did not repeat is the only thing established about it, and it is
    // enough to justify a second attempt — a moment's delay rather than a whole
    // agent turn's worth of prices.
    let call = 0;
    respond = (send) => {
      call += 1;
      if (call === 1) send(200, 'text/html', '<!doctype html>');
      else send(200, 'application/json', REAL_CATALOG);
    };

    const catalog = await fetchCatalog(`${base}/data/pricing.json`);
    expect(catalog.models.length).toBeGreaterThan(0);
    expect(call).toBe(2);
  });
});

describe('other ways a server misbehaves', () => {
  it('reports the status code on a non-200', async () => {
    respond = (send) => send(503, 'text/plain', 'down for maintenance');
    await expect(fetchCatalog(`${base}/data/pricing.json`)).rejects.toThrow(/HTTP 503/);
  });

  it('rejects JSON that is not a catalog rather than treating it as an empty one', async () => {
    // A server that answers with the right content type and the wrong shape is
    // the most dangerous case: it would otherwise become "no models found",
    // which looks identical to a file with nothing in it.
    respond = (send) => send(200, 'application/json', JSON.stringify({ hello: 'world' }));
    await expect(fetchCatalog(`${base}/data/pricing.json`)).rejects.toThrow();
  });

  it('rejects a truncated body', async () => {
    respond = (send) => send(200, 'application/json', REAL_CATALOG.slice(0, 400));
    await expect(fetchCatalog(`${base}/data/pricing.json`)).rejects.toThrow();
  });

  it('gives up after the retry rather than hanging on a persistently bad server', async () => {
    let calls = 0;
    respond = (send) => {
      calls += 1;
      send(200, 'text/html', '<!doctype html>');
    };
    await expect(fetchCatalog(`${base}/data/pricing.json`)).rejects.toThrow(/Expected JSON/);
    expect(calls).toBe(2);
  });
});

describe('bounded fallback honesty', () => {
  it('marks a retained copy instead of passing it off as current', async () => {
    const now = Date.parse(PARSED_CATALOG.generatedAt) + 60 * 60 * 1000;
    const first = await getCatalog(now, async () => JSON.parse(REAL_CATALOG));
    expect(first.servedFromFallback).toBe(false);

    const fallback = await getCatalog(now + 6 * 60 * 1000, async () => {
      throw new Error('offline');
    });
    expect(fallback.servedFromFallback).toBe(true);
    expect(fallback.warning).toContain('could not be reached');
    expect(fallback.warning).toContain(new Date(now).toISOString());
  });

  it('returns no prices once the fallback window expires', async () => {
    const now = Date.parse(PARSED_CATALOG.generatedAt) + 60 * 60 * 1000;
    await getCatalog(now, async () => JSON.parse(REAL_CATALOG));
    await expect(
      getCatalog(now + 25 * 60 * 60 * 1000, async () => {
        throw new Error('offline');
      }),
    ).rejects.toBeInstanceOf(CatalogUnavailableError);
  });
});
