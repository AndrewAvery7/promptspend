/**
 * PromptSpend alerts API.
 *
 * Everything the browser and the pricing pipeline talk to. The routing is a
 * switch rather than a framework: there are a dozen endpoints, and a router
 * dependency would be more code than the thing it routes.
 */

import { emailEnabled, pushEnabled, requireSecret, siteUrl, type Env } from './env';
import {
  HttpError,
  badRequest,
  corsHeaders,
  hashClientIp,
  json,
  noContent,
  notFound,
  readJson,
  tooManyRequests,
  unauthorized,
} from './lib/http';
import { issueToken, verifyToken } from './lib/tokens';
import { verifySignature } from './lib/signature';
import { verifyTurnstile } from './lib/turnstile';
import { createManageCode, hashManageCode, manageCodeMatches, parseManageCode } from './lib/manage-code';
import {
  requireCadence,
  requireEmail,
  requireModelIds,
  requirePushEndpoint,
  requireScope,
  requireSubscriptionKeys,
} from './lib/validate';
import {
  activateEmail,
  activateLaunch,
  deleteEmailManageCode,
  deletePushSubscription,
  findEmailByAddress,
  findEmailById,
  findLaunchById,
  getFollows,
  insertEvent,
  latestEmailManageCode,
  pruneEmailManageCodes,
  prunePendingLaunch,
  prunePendingSubscribers,
  pruneRateLimits,
  rejectEmailManageCode,
  setFollows,
  storeEmailManageCode,
  unsubscribeEmail,
  unsubscribeLaunch,
  updateEmailPreferences,
  upsertPendingEmail,
  upsertPendingLaunch,
  upsertPushSubscription,
  withinRateLimit,
} from './db/queries';
import { changedModelIds, validateChangeSet, type ChangeSet } from './changes';
import { createTransport } from './email/transport';
import { renderConfirmation, renderLaunchConfirmation, renderManageCode } from './email/render';
import { buildNotificationPayload, sendPush } from './push/send';
import { assertKeyPairMatches } from './push/vapid';
import { fanoutDigest, fanoutInstantEmail, fanoutPush } from './fanout';
import {
  confirmLaunchUnsubscribePage,
  confirmUnsubscribePage,
  expiredLinkPage,
  launchConfirmedPage,
  launchUnsubscribedPage,
  page,
  unsubscribedPage,
} from './pages';
import { mobileTurnstilePage } from './turnstile-page';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (cause) {
      if (cause instanceof HttpError) {
        if (cause.detail) console.warn(`${cause.status} ${cause.message} — ${cause.detail}`);
        return json({ error: cause.message }, request, env, cause.status);
      }
      // Never surface an internal message: it can carry a binding name, a
      // query fragment, or a piece of a secret.
      console.error('unhandled error', cause);
      return json({ error: 'Something went wrong on our side.' }, request, env, 500);
    }
  },

  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      background(
        'weekly digest',
        (async () => {
          const counts = await fanoutDigest(env);
          console.log(`weekly digest: ${JSON.stringify(counts)}`);
          await pruneRateLimits(env.DB);
          await pruneEmailManageCodes(env.DB);
          const pruned = await prunePendingSubscribers(env.DB);
          if (pruned > 0) console.log(`pruned ${pruned} unconfirmed signups`);
          const prunedLaunch = await prunePendingLaunch(env.DB);
          if (prunedLaunch > 0) console.log(`pruned ${prunedLaunch} unconfirmed launch signups`);
        })(),
      ),
    );
  },
};

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  switch (`${method} ${path}`) {
    case 'GET /':
    case 'GET /health':
      return handleHealth(request, env);
    case 'GET /v1/config':
      return handleConfig(request, env);
    case 'GET /v1/mobile-turnstile':
      return mobileTurnstilePage();
    case 'POST /v1/push/subscribe':
      return handlePushSubscribe(request, env);
    case 'POST /v1/push/unsubscribe':
      return handlePushUnsubscribe(request, env);
    case 'POST /v1/push/test':
      return handlePushTest(request, env);
    case 'POST /v1/email/subscribe':
      return handleEmailSubscribe(request, env);
    case 'POST /v1/email/manage/request':
      return handleEmailManageRequest(request, env, ctx);
    case 'POST /v1/email/manage/verify':
      return handleEmailManageVerify(request, env);
    case 'GET /v1/email/confirm':
      return handleEmailConfirm(request, env);
    case 'GET /v1/email/unsubscribe':
      return handleUnsubscribeGet(request, env);
    case 'POST /v1/email/unsubscribe':
      return handleUnsubscribePost(request, env);
    case 'POST /v1/launch/subscribe':
      return handleLaunchSubscribe(request, env);
    case 'GET /v1/launch/confirm':
      return handleLaunchConfirm(request, env);
    case 'GET /v1/launch/unsubscribe':
      return handleLaunchUnsubscribeGet(request, env);
    case 'POST /v1/launch/unsubscribe':
      return handleLaunchUnsubscribePost(request, env);
    case 'GET /v1/preferences':
      return handleGetPreferences(request, env);
    case 'POST /v1/preferences':
      return handleSetPreferences(request, env);
    case 'POST /v1/notify':
      return handleNotify(request, env, ctx);
    default:
      throw notFound();
  }
}

// ------------------------------------------------------------------ meta

async function handleHealth(request: Request, env: Env): Promise<Response> {
  // A health check that only says "the worker is running" tells you nothing
  // you did not already know from getting a response at all. These are the
  // three things that silently stop this feature working.
  const checks: Record<string, unknown> = {
    push: pushEnabled(env),
    email: emailEnabled(env),
    emailTransport: env.EMAIL_TRANSPORT,
    tokenSecret: Boolean(env.TOKEN_SECRET),
    notifySecret: Boolean(env.NOTIFY_SECRET),
    turnstile: Boolean(env.TURNSTILE_SECRET_KEY),
  };

  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    try {
      await assertKeyPairMatches(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
      checks.vapidKeyPair = 'ok';
    } catch (cause) {
      checks.vapidKeyPair = cause instanceof Error ? cause.message : 'invalid';
    }
  }

  try {
    await env.DB.prepare('SELECT 1').first();
    checks.database = 'ok';
  } catch {
    checks.database = 'unreachable';
  }

  const healthy = checks.database === 'ok' && checks.vapidKeyPair !== 'invalid';
  return json({ ok: healthy, checks }, request, env, healthy ? 200 : 503);
}

/** What the browser needs to know before it can offer either channel. */
async function handleConfig(request: Request, env: Env): Promise<Response> {
  return json(
    {
      pushEnabled: pushEnabled(env),
      emailEnabled: emailEnabled(env),
      vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
      turnstileRequired: Boolean(env.TURNSTILE_SECRET_KEY),
    },
    request,
    env,
  );
}

// ------------------------------------------------------------------ push

async function guard(request: Request, env: Env, name: string, limit: number): Promise<string> {
  const ipHash = await hashClientIp(request, requireSecret(env, 'TOKEN_SECRET'));
  if (!(await withinRateLimit(env.DB, `${name}:${ipHash}`, limit, 3600))) throw tooManyRequests();
  return ipHash;
}

async function handlePushSubscribe(request: Request, env: Env): Promise<Response> {
  if (!pushEnabled(env)) throw new HttpError(503, 'Push alerts are not configured yet.');
  await guard(request, env, 'push-subscribe', 30);

  const body = await readJson<Record<string, unknown>>(request);
  const endpoint = requirePushEndpoint(body.endpoint);
  const keys = requireSubscriptionKeys(body.keys);
  const scope = requireScope(body.scope);
  const modelIds = requireModelIds(body.models, scope);

  const subscription = await upsertPushSubscription(env.DB, { endpoint, ...keys, scope });
  await setFollows(env.DB, 'push', subscription.id, modelIds);

  return json({ ok: true, scope, models: modelIds }, request, env);
}

async function handlePushUnsubscribe(request: Request, env: Env): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(request);
  // No rate limit and no authentication: knowing an endpoint is the only thing
  // this proves, and the endpoint is the browser's own. The worst an attacker
  // with someone's endpoint can do is stop notifications they could equally
  // have caused by spamming the endpoint until it was pruned.
  await deletePushSubscription(env.DB, requirePushEndpoint(body.endpoint));
  return noContent(request, env);
}

/** Sends one notification to the caller's own endpoint, so "it works" is provable. */
async function handlePushTest(request: Request, env: Env): Promise<Response> {
  if (!pushEnabled(env)) throw new HttpError(503, 'Push alerts are not configured yet.');
  await guard(request, env, 'push-test', 10);

  const body = await readJson<Record<string, unknown>>(request);
  const endpoint = requirePushEndpoint(body.endpoint);
  const keys = requireSubscriptionKeys(body.keys);

  const outcome = await sendPush(
    { endpoint, ...keys },
    buildNotificationPayload({
      title: 'PromptSpend alerts are on',
      body: 'This is what a price change will look like.',
      url: siteUrl(env),
      tag: 'promptspend-test',
    }),
    {
      publicKey: env.VAPID_PUBLIC_KEY!,
      privateKey: env.VAPID_PRIVATE_KEY!,
      subject: env.VAPID_SUBJECT,
    },
  );

  if (outcome.status === 'sent') return json({ ok: true }, request, env);
  if (outcome.status === 'gone') {
    await deletePushSubscription(env.DB, endpoint);
    throw badRequest('That subscription is no longer valid. Try turning alerts off and on again.');
  }
  throw new HttpError(502, 'The push service would not accept the message.', JSON.stringify(outcome));
}

// ----------------------------------------------------------------- email

async function handleEmailSubscribe(request: Request, env: Env): Promise<Response> {
  if (!emailEnabled(env)) throw new HttpError(503, 'Email alerts are not configured yet.');
  const ipHash = await guard(request, env, 'email-subscribe', 10);

  const body = await readJson<Record<string, unknown>>(request);
  const turnstile = await verifyTurnstile(
    env,
    typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined,
    request.headers.get('CF-Connecting-IP'),
    body.client === 'mobile' ? 'mobile_email_alerts' : 'web_email_alerts',
  );
  if (!turnstile.ok) {
    throw badRequest(
      'We could not verify that you are human. Refresh the page and try again.',
      (turnstile.errorCodes ?? []).join(','),
    );
  }

  const email = requireEmail(body.email);
  const cadence = requireCadence(body.cadence);
  const scope = requireScope(body.scope);
  const modelIds = requireModelIds(body.models, scope);

  const existing = await findEmailByAddress(env.DB, email);
  if (existing?.status === 'active') {
    // A public subscribe form is not authority to rewrite an existing
    // subscriber's choices. Send the owner a short-lived management code and
    // keep the HTTP response indistinguishable from a new subscription.
    await sendEmailManagementCode(env, email);
    return json({ ok: true, pending: true }, request, env);
  }

  const subscriber = await upsertPendingEmail(env.DB, {
    email,
    cadence,
    scope,
    consentIpHash: ipHash,
    modelIds,
  });

  const token = await issueToken(requireSecret(env, 'TOKEN_SECRET'), 'confirm', subscriber.id);
  const confirmUrl = `${new URL(request.url).origin}/v1/email/confirm?t=${encodeURIComponent(token)}`;
  const scopeLabel =
    scope === 'all'
      ? 'any model in the catalog changes price'
      : `${modelIds.length === 1 ? 'the model' : `any of the ${modelIds.length} models`} you follow changes price`;

  const message = renderConfirmation(
    { confirmUrl, unsubscribeUrl: confirmUrl, preferencesUrl: siteUrl(env), siteUrl: siteUrl(env) },
    scopeLabel,
  );

  const result = await createTransport(env).send({
    to: subscriber.email,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
  if (!result.ok) {
    throw new HttpError(502, 'We could not send the confirmation email. Please try again.', result.detail);
  }

  // The response is identical whether or not this address was already
  // subscribed, so the endpoint cannot be used to test whether someone has an
  // account here.
  return json({ ok: true, pending: true }, request, env);
}

async function handleEmailManageRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (!emailEnabled(env)) throw new HttpError(503, 'Email alerts are not configured yet.');
  await guard(request, env, 'email-manage-request', 6);

  const body = await readJson<Record<string, unknown>>(request);
  const turnstile = await verifyTurnstile(
    env,
    typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined,
    request.headers.get('CF-Connecting-IP'),
    'mobile_email_alerts',
  );
  if (!turnstile.ok) {
    throw badRequest(
      'We could not verify that you are human. Refresh the check and try again.',
      (turnstile.errorCodes ?? []).join(','),
    );
  }

  const email = requireEmail(body.email);
  ctx.waitUntil(sendEmailManagementCode(env, email));

  // Lookup, rate-limit, code creation and email delivery continue after this
  // deliberately uniform response. Keeping those operations off the response
  // path prevents delivery latency from becoming a subscriber-enumeration
  // signal.
  return json({ ok: true, pending: true }, request, env);
}

async function sendEmailManagementCode(env: Env, email: string): Promise<void> {
  try {
    const subscriber = await findEmailByAddress(env.DB, email);

    if (subscriber?.status === 'active') {
      const withinSubscriberLimit = await withinRateLimit(
        env.DB,
        `email-manage-subscriber:${subscriber.id}`,
        3,
        3600,
      );
      if (withinSubscriberLimit) {
        const code = createManageCode();
        const codeHash = await hashManageCode(requireSecret(env, 'TOKEN_SECRET'), subscriber.id, code);
        await storeEmailManageCode(env.DB, subscriber.id, codeHash);
        const message = renderManageCode(code, siteUrl(env));
        const result = await createTransport(env).send({
          to: subscriber.email,
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
        if (!result.ok) {
          const stored = await latestEmailManageCode(env.DB, subscriber.id);
          if (stored) await deleteEmailManageCode(env.DB, stored.id);
          console.warn('manage-code delivery failed');
        }
      }
    }
  } catch {
    // The public response is intentionally already complete. Log no address or
    // exception object: either could contain subscriber data or provider detail.
    console.warn('manage-code dispatch failed');
  }
}

async function handleEmailManageVerify(request: Request, env: Env): Promise<Response> {
  if (!emailEnabled(env)) throw new HttpError(503, 'Email alerts are not configured yet.');
  await guard(request, env, 'email-manage-verify', 20);
  const body = await readJson<Record<string, unknown>>(request);
  const email = requireEmail(body.email);
  const code = parseManageCode(body.code);
  if (!code) throw badRequest('That code is invalid or expired. Request a new one.');

  const subscriber = await findEmailByAddress(env.DB, email);
  // Always do the same database lookup and HMAC work, including for an unknown
  // address, so response time does not reveal whether a person subscribes.
  const subjectId = subscriber?.id ?? '00000000-0000-0000-0000-000000000000';
  const stored = await latestEmailManageCode(env.DB, subjectId);
  const candidateHash = await hashManageCode(requireSecret(env, 'TOKEN_SECRET'), subjectId, code);
  if (!subscriber || subscriber.status !== 'active') {
    throw badRequest('That code is invalid or expired. Request a new one.');
  }
  if (!stored || stored.expires_at < new Date().toISOString() || stored.attempts >= 5) {
    if (stored) await deleteEmailManageCode(env.DB, stored.id);
    throw badRequest('That code is invalid or expired. Request a new one.');
  }

  if (!manageCodeMatches(stored.code_hash, candidateHash)) {
    await rejectEmailManageCode(env.DB, stored.id);
    throw badRequest('That code is invalid or expired. Request a new one.');
  }

  await deleteEmailManageCode(env.DB, stored.id);
  const token = await issueToken(requireSecret(env, 'TOKEN_SECRET'), 'mobile-preferences', subscriber.id);
  return json(
    {
      ok: true,
      token,
      preferences: {
        email: subscriber.email,
        status: subscriber.status,
        cadence: subscriber.cadence,
        scope: subscriber.scope,
        models: await getFollows(env.DB, 'email', subscriber.id),
      },
    },
    request,
    env,
  );
}

async function handleEmailConfirm(request: Request, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const result = await verifyToken(requireSecret(env, 'TOKEN_SECRET'), 'confirm', token);
  if (!result.ok) {
    return expiredLinkPage(
      result.reason === 'expired'
        ? 'Confirmation links are valid for 48 hours. Subscribe again and we will send a fresh one.'
        : 'That confirmation link could not be verified.',
    );
  }

  await activateEmail(env.DB, result.subjectId);
  const subscriber = await findEmailById(env.DB, result.subjectId);
  if (!subscriber) return expiredLinkPage('That subscription no longer exists.');

  const preferences = await issueToken(requireSecret(env, 'TOKEN_SECRET'), 'preferences', result.subjectId);
  const manageUrl = `${siteUrl(env)}?alerts=${encodeURIComponent(preferences)}`;

  return page({
    title: 'Subscribed',
    heading: "You're on the list",
    body: `<p>PromptSpend will email this address ${
      subscriber.cadence === 'weekly' ? 'once a week' : 'as soon as prices move'
    }.</p>
      <p class="muted">Every message carries a one-click unsubscribe. Nothing is tracked — no opens, no clicks, no third parties.</p>
      <a class="btn" href="${manageUrl}">Manage what you get</a>`,
  });
}

async function handleUnsubscribeGet(request: Request, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const result = await verifyToken(requireSecret(env, 'TOKEN_SECRET'), 'unsubscribe', token);
  if (!result.ok) return expiredLinkPage('That unsubscribe link could not be verified.');
  return confirmUnsubscribePage(token);
}

async function handleUnsubscribePost(request: Request, env: Env): Promise<Response> {
  // Two shapes arrive here: our own form (urlencoded body) and RFC 8058
  // one-click from a mail client, which sends `List-Unsubscribe=One-Click` as
  // the body and puts the token in the query string.
  const url = new URL(request.url);
  let token = url.searchParams.get('t') ?? '';
  if (!token) {
    const form = await request.formData().catch(() => null);
    token = typeof form?.get('t') === 'string' ? (form.get('t') as string) : '';
  }

  const result = await verifyToken(requireSecret(env, 'TOKEN_SECRET'), 'unsubscribe', token);
  if (!result.ok) return expiredLinkPage('That unsubscribe link could not be verified.');

  await unsubscribeEmail(env.DB, result.subjectId);
  return unsubscribedPage(siteUrl(env));
}

// --------------------------------------------------- mobile launch notify

/**
 * "Tell me when the apps are out" — a single-message list, kept apart from
 * price alerts at every layer: its own table, its own token purposes, its own
 * Turnstile action, its own confirmation copy.
 *
 * The one behavioural difference from `handleEmailSubscribe` worth calling out:
 * there is no "already active, send a management code instead" branch. There
 * are no preferences to manage — the only states are on the list and not on it
 * — so re-submitting simply re-sends the confirmation for a pending row and is
 * a no-op for a confirmed one. The HTTP response is identical either way, so
 * the endpoint still cannot be used to test whether an address is on the list.
 */
async function handleLaunchSubscribe(request: Request, env: Env): Promise<Response> {
  if (!emailEnabled(env)) throw new HttpError(503, 'Email is not configured yet.');
  const ipHash = await guard(request, env, 'launch-subscribe', 10);

  const body = await readJson<Record<string, unknown>>(request);
  const turnstile = await verifyTurnstile(
    env,
    typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined,
    request.headers.get('CF-Connecting-IP'),
    'web_launch_notify',
  );
  if (!turnstile.ok) {
    throw badRequest(
      'We could not verify that you are human. Refresh the page and try again.',
      (turnstile.errorCodes ?? []).join(','),
    );
  }

  const email = requireEmail(body.email);
  const subscriber = await upsertPendingLaunch(env.DB, { email, consentIpHash: ipHash });

  // A row that has already had its one message stays untouched, and no second
  // confirmation goes out. Returning the same shape keeps that indistinguishable
  // from a fresh signup.
  if (subscriber.status === 'notified') return json({ ok: true, pending: true }, request, env);

  if (subscriber.status === 'pending') {
    const token = await issueToken(requireSecret(env, 'TOKEN_SECRET'), 'launch-confirm', subscriber.id);
    const confirmUrl = `${new URL(request.url).origin}/v1/launch/confirm?t=${encodeURIComponent(token)}`;
    const message = renderLaunchConfirmation(confirmUrl, siteUrl(env));

    const result = await createTransport(env).send({
      to: subscriber.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (!result.ok) {
      throw new HttpError(502, 'We could not send the confirmation email. Please try again.', result.detail);
    }
  }

  return json({ ok: true, pending: true }, request, env);
}

async function handleLaunchConfirm(request: Request, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const result = await verifyToken(requireSecret(env, 'TOKEN_SECRET'), 'launch-confirm', token);
  if (!result.ok) {
    return expiredLinkPage(
      result.reason === 'expired'
        ? 'Confirmation links are valid for 48 hours. Sign up again and we will send a fresh one.'
        : 'That confirmation link could not be verified.',
    );
  }

  await activateLaunch(env.DB, result.subjectId);
  const subscriber = await findLaunchById(env.DB, result.subjectId);
  if (!subscriber) return expiredLinkPage('That signup no longer exists.');

  const unsubscribe = await issueToken(
    requireSecret(env, 'TOKEN_SECRET'),
    'launch-unsubscribe',
    result.subjectId,
  );
  const unsubscribeUrl = `${new URL(request.url).origin}/v1/launch/unsubscribe?t=${encodeURIComponent(unsubscribe)}`;

  return launchConfirmedPage(siteUrl(env), unsubscribeUrl);
}

async function handleLaunchUnsubscribeGet(request: Request, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const result = await verifyToken(requireSecret(env, 'TOKEN_SECRET'), 'launch-unsubscribe', token);
  if (!result.ok) return expiredLinkPage('That unsubscribe link could not be verified.');
  return confirmLaunchUnsubscribePage(token);
}

async function handleLaunchUnsubscribePost(request: Request, env: Env): Promise<Response> {
  // Two shapes, same as the price-alert unsubscribe: our own form posts the
  // token in an urlencoded body, RFC 8058 one-click puts it in the query string.
  const url = new URL(request.url);
  let token = url.searchParams.get('t') ?? '';
  if (!token) {
    const form = await request.formData().catch(() => null);
    token = typeof form?.get('t') === 'string' ? (form.get('t') as string) : '';
  }

  const result = await verifyToken(requireSecret(env, 'TOKEN_SECRET'), 'launch-unsubscribe', token);
  if (!result.ok) return expiredLinkPage('That unsubscribe link could not be verified.');

  await unsubscribeLaunch(env.DB, result.subjectId);
  return launchUnsubscribedPage(siteUrl(env));
}

// ----------------------------------------------------------- preferences

async function subjectFromPreferencesToken(request: Request, env: Env): Promise<string> {
  const url = new URL(request.url);
  const authorization = request.headers.get('Authorization') ?? '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const token = bearer || url.searchParams.get('t') || '';
  const secret = requireSecret(env, 'TOKEN_SECRET');
  let result = await verifyToken(secret, bearer ? 'mobile-preferences' : 'preferences', token);
  // A preference link from an alert email can be handed to the native app.
  // Once captured, the app removes it from navigation and carries it only in
  // the Authorization header. Keep those existing links interoperable.
  if (bearer && !result.ok) result = await verifyToken(secret, 'preferences', token);
  if (!result.ok) throw unauthorized(`preferences token ${result.reason}`);
  return result.subjectId;
}

async function handleGetPreferences(request: Request, env: Env): Promise<Response> {
  const id = await subjectFromPreferencesToken(request, env);
  const subscriber = await findEmailById(env.DB, id);
  if (!subscriber) throw notFound();

  return json(
    {
      // The address is echoed so the UI can say *which* subscription is being
      // edited. The token already proves possession of it, so this discloses
      // nothing the holder did not have.
      email: subscriber.email,
      status: subscriber.status,
      cadence: subscriber.cadence,
      scope: subscriber.scope,
      models: await getFollows(env.DB, 'email', id),
    },
    request,
    env,
  );
}

async function handleSetPreferences(request: Request, env: Env): Promise<Response> {
  const id = await subjectFromPreferencesToken(request, env);
  const body = await readJson<Record<string, unknown>>(request);
  const subscriber = await findEmailById(env.DB, id);
  if (!subscriber || subscriber.status !== 'active') throw notFound();

  if (body.unsubscribe === true) {
    await unsubscribeEmail(env.DB, id);
    return json({ ok: true, status: 'unsubscribed' }, request, env);
  }

  const cadence = requireCadence(body.cadence);
  const scope = requireScope(body.scope);
  const modelIds = requireModelIds(body.models, scope);

  await updateEmailPreferences(env.DB, id, { cadence, modelIds, scope });
  return json({ ok: true, cadence, scope, models: modelIds }, request, env);
}

// ---------------------------------------------------------------- notify

async function handleNotify(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const raw = await request.text();
  if (raw.length > 256 * 1024) throw badRequest('Notify payload is too large.');

  const check = await verifySignature(
    requireSecret(env, 'NOTIFY_SECRET'),
    request.headers.get('X-PromptSpend-Timestamp'),
    request.headers.get('X-PromptSpend-Signature'),
    raw,
  );
  if (!check.ok) throw unauthorized(`notify signature ${check.reason}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw badRequest('Notify payload is not valid JSON.');
  }

  const problems = validateChangeSet(parsed);
  if (problems.length > 0) throw badRequest(`Notify payload is invalid: ${problems.join('; ')}`);
  const set = parsed as ChangeSet;

  const isNew = await insertEvent(env.DB, set.eventId, raw, changedModelIds(set));
  if (!isNew) {
    // Not an error. The pipeline retried, and the whole point of a
    // deterministic event id is that this costs nothing.
    return json({ ok: true, duplicate: true, eventId: set.eventId }, request, env);
  }

  // Fan out after responding. A CI job should not sit waiting on a few hundred
  // push requests, and `waitUntil` keeps the worker alive until they finish.
  ctx.waitUntil(
    background(
      'notification fan-out',
      (async () => {
        const push = await fanoutPush(env, { id: set.eventId, set });
        const email = await fanoutInstantEmail(env, { id: set.eventId, set });
        console.log(`notify ${set.eventId}: push=${JSON.stringify(push)} email=${JSON.stringify(email)}`);
      })(),
    ),
  );

  return json({ ok: true, eventId: set.eventId, models: changedModelIds(set).length }, request, env);
}

function background(label: string, promise: Promise<void>): Promise<void> {
  return promise.catch(() => {
    // No exception objects: provider responses and bindings can contain
    // subscriber data or operational secrets.
    console.error(`${label} failed`);
  });
}
