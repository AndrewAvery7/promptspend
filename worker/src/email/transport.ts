/**
 * Sending mail, behind an interface.
 *
 * The indirection earns its keep twice. It lets the whole feature ship and run
 * before a sending domain exists — `console` records what would have gone out,
 * so the flows are testable end to end without a single real message. And it
 * keeps the door open to a different provider: Cloudflare Email Sending is
 * $0.35 per thousand against Amazon SES's $0.10, which is irrelevant at a few
 * hundred subscribers and stops being irrelevant somewhere north of a hundred
 * thousand messages a month.
 */

import type { Env } from '../env';

export interface OutboundEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** RFC 8058 list headers, primarily. */
  headers?: Record<string, string>;
}

export type EmailSendResult = { ok: true; id?: string } | { ok: false; retryable: boolean; detail: string };

export interface EmailTransport {
  readonly name: string;
  send(message: OutboundEmail): Promise<EmailSendResult>;
}

/** Cloudflare Email Sending, over the REST API. */
class CloudflareTransport implements EmailTransport {
  readonly name = 'cloudflare';

  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    private readonly from: { address: string; name: string },
    private readonly replyTo: string,
  ) {}

  async send(message: OutboundEmail): Promise<EmailSendResult> {
    // One request per recipient, deliberately. Batching would put subscribers'
    // addresses in each other's headers, and every message carries its own
    // single-use unsubscribe link, so there is nothing to batch anyway.
    const body: Record<string, unknown> = {
      to: message.to,
      from: this.from,
      subject: message.subject,
      html: message.html,
      text: message.text,
    };
    if (this.replyTo) body.reply_to = this.replyTo;
    if (message.headers) body.headers = message.headers;

    let response: Response;
    try {
      response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/email/sending/send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );
    } catch (cause) {
      return {
        ok: false,
        retryable: true,
        detail: cause instanceof Error ? cause.message : 'network error',
      };
    }

    if (response.ok) {
      const payload = (await response.json().catch(() => null)) as { result?: { id?: string } } | null;
      return { ok: true, id: payload?.result?.id };
    }

    const detail = (await response.text().catch(() => '')).slice(0, 400);
    // 429 and 5xx are worth another attempt; a 4xx is a message this transport
    // will never accept, and retrying it just burns quota against the same wall.
    return {
      ok: false,
      retryable: response.status === 429 || response.status >= 500,
      detail: `HTTP ${response.status}: ${detail}`,
    };
  }
}

/**
 * Development and pre-domain transport.
 *
 * Writes a compact record of the message to the log. Bodies are omitted — they
 * are long, and the reason to look at this is to confirm that the right address
 * would get the right subject with a working unsubscribe header.
 */
class ConsoleTransport implements EmailTransport {
  readonly name = 'console';

  async send(message: OutboundEmail): Promise<EmailSendResult> {
    console.log(
      JSON.stringify({
        transport: 'console',
        to: message.to,
        subject: message.subject,
        listUnsubscribe: message.headers?.['List-Unsubscribe'],
        textBytes: message.text.length,
        htmlBytes: message.html.length,
      }),
    );
    return { ok: true, id: 'console' };
  }
}

export function createTransport(env: Env): EmailTransport {
  if (env.EMAIL_TRANSPORT === 'cloudflare') {
    if (!env.EMAIL_API_TOKEN) {
      throw new Error('EMAIL_TRANSPORT is "cloudflare" but EMAIL_API_TOKEN is not set');
    }
    return new CloudflareTransport(
      env.CLOUDFLARE_ACCOUNT_ID,
      env.EMAIL_API_TOKEN,
      { address: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME },
      env.EMAIL_REPLY_TO,
    );
  }
  return new ConsoleTransport();
}
