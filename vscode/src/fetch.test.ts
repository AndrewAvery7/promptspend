/**
 * The real `fetch` path, against a real server.
 *
 * catalog.test.ts injects a fake fetcher into every case, which is right for
 * testing the freshness policy and wrong as the whole story: it meant the one
 * function that actually talks to a network was never executed. The failure that
 * cost a debugging session — the catalog URL transiently serving the site's own
 * `index.html` instead of JSON — lived entirely inside the untested part.
 *
 * A loopback server rather than the live site, so the suite stays offline-safe
 * and deterministic while still exercising fetch, headers, parsing and validation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchCatalog } from './catalog';

const REAL_CATALOG = readFileSync(resolve(import.meta.dirname, '../../public/data/pricing.json'), 'utf8');

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
    // true and tells nobody that a web page arrived where a catalog should.
    respond = (send) =>
      send(200, 'text/html; charset=utf-8', '<!doctype html><html><body>PromptSpend</body></html>');

    await expect(fetchCatalog(`${base}/data/pricing.json`)).rejects.toThrow(/Expected JSON/);
    await expect(fetchCatalog(`${base}/data/pricing.json`)).rejects.toThrow(/text\/html/);
  });

  it('retries, so one bad response does not empty the editor', async () => {
    // The transient case. A deploy in flight should cost a moment, not the
    // whole session's prices.
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
