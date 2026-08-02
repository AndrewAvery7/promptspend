/**
 * The handful of pages the worker serves directly.
 *
 * Confirmation and unsubscribe have to work in a webmail preview pane, in a
 * text browser, and with JavaScript disabled — a one-click unsubscribe that
 * depends on a React bundle loading is not an unsubscribe. So these are
 * self-contained documents with inline styles and no scripts, sharing the app's
 * palette but none of its code.
 */

const STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    background: #ebeff5; color: #15181d;
    font: 400 16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  }
  .card {
    width: 100%; max-width: 520px; background: #fff; border: 1px solid #dce2eb;
    border-radius: 14px; padding: 38px 40px;
    box-shadow: 0 1px 2px rgb(21 24 29 / 5%), 0 6px 24px rgb(21 24 29 / 7%);
  }
  .brand { font-weight: 700; font-size: 19px; letter-spacing: -0.02em; color: #2456e6; margin: 0 0 22px; }
  h1 { margin: 0 0 12px; font-size: 25px; line-height: 1.24; letter-spacing: -0.02em; }
  p { margin: 0 0 14px; }
  p.muted { color: #5f6b78; font-size: 14.5px; }
  a.btn {
    display: inline-block; margin-top: 12px; padding: 13px 26px; border-radius: 10px;
    background: #2456e6; color: #fff; text-decoration: none; font-weight: 600;
  }
  a { color: #2456e6; }
  form { margin-top: 12px; }
  button {
    padding: 13px 26px; border: 0; border-radius: 10px; background: #2456e6; color: #fff;
    font: 600 16px/1 inherit; cursor: pointer;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #0b0e14; color: #e9ecf2; }
    .card { background: #121722; border-color: #27303f; }
    p.muted { color: #93a0b4; }
    .brand, a { color: #7c9dff; }
    a.btn, button { background: #2456e6; color: #fff; }
  }
`;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function page(options: { title: string; heading: string; body: string; status?: number }): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(options.title)} · PromptSpend</title>
<style>${STYLE}</style>
</head>
<body>
  <main class="card">
    <p class="brand">PromptSpend</p>
    <h1>${escapeHtml(options.heading)}</h1>
    ${options.body}
  </main>
</body>
</html>`;

  return new Response(html, {
    status: options.status ?? 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      // These pages carry a bearer token in the URL. Framing them would let
      // another site clickjack the unsubscribe button.
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
    },
  });
}

export function unsubscribedPage(siteUrl: string): Response {
  return page({
    title: 'Unsubscribed',
    heading: "You're unsubscribed",
    body: `<p>That address will not receive any more PromptSpend price alerts. It takes effect immediately — there is no "up to 10 days" here.</p>
      <p class="muted">Your address and the list of models you followed have been deleted, not flagged. If you subscribe again later it starts fresh.</p>
      <a class="btn" href="${escapeHtml(siteUrl)}">Back to PromptSpend</a>`,
  });
}

export function confirmUnsubscribePage(token: string): Response {
  // Mail clients and security scanners prefetch links. A GET that unsubscribes
  // on sight means a scanner can silently remove someone from the list, so the
  // GET asks and the POST acts. One-click unsubscribe from the mail client is
  // unaffected: RFC 8058 sends a POST directly.
  return page({
    title: 'Unsubscribe',
    heading: 'Unsubscribe from price alerts?',
    body: `<p>Confirm and PromptSpend will stop emailing this address.</p>
      <form method="POST" action="/v1/email/unsubscribe">
        <input type="hidden" name="t" value="${escapeHtml(token)}">
        <button type="submit">Yes, unsubscribe me</button>
      </form>`,
  });
}

export function expiredLinkPage(what: string): Response {
  return page({
    status: 410,
    title: 'Link expired',
    heading: 'That link has expired',
    body: `<p>${escapeHtml(what)}</p>
      <p class="muted">Links are signed and time-limited so that a forwarded email cannot be used to change someone else's settings.</p>`,
  });
}
