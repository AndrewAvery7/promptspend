import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Catalog } from '@/lib/pricing/catalog';
import {
  AlertsError,
  alertsConfigured,
  fetchAlertsConfig,
  fetchPreferences,
  savePreferences,
  sendTestPush,
  subscribeEmail,
  subscribePush,
  unsubscribeByToken,
  unsubscribePush,
  type AlertsConfig,
  type EmailPreferences,
} from '@/lib/alerts/api';
import {
  currentSubscription,
  detectPushSupport,
  permissionState,
  PushDenied,
  subscribe as createPushSubscription,
  subscriptionToPayload,
  unsubscribeLocally,
} from '@/lib/alerts/push';
import { Turnstile } from '@/components/Turnstile';
import { Flag } from '@/components/Flag';

type Scope = 'all' | 'followed';
type Cadence = 'instant' | 'weekly';

/** Where a preferences link drops the visitor back into the app. */
const PREFERENCES_PARAM = 'alerts';

interface AlertsPanelProps {
  catalog: Catalog;
  theme: 'light' | 'dark';
  onToast: (message: string) => void;
  /** The zero-infrastructure options, stacked above the push card. */
  children?: ReactNode;
}

export function AlertsPanel({ catalog, theme, onToast, children }: AlertsPanelProps) {
  const [config, setConfig] = useState<AlertsConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [manageToken, setManageToken] = useState<string | null>(null);

  /**
   * Take the token out of the address bar the moment it is read.
   *
   * It is a bearer credential. Left in the URL it goes into browser history,
   * into whatever the visitor copies to share their estimate, and into any
   * referrer a future link might carry. Held in component state it does none of
   * those things and works exactly as well.
   */
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get(PREFERENCES_PARAM);
    if (!token) return;
    // Reading the URL and rewriting history is a side effect on an external
    // system, which is exactly what an effect is for. The token cannot be
    // derived during render, because the same pass has to strip it from the
    // address bar — and it runs once, on mount, so nothing cascades.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setManageToken(token);
    const url = new URL(window.location.href);
    url.searchParams.delete(PREFERENCES_PARAM);
    window.history.replaceState({}, '', url);
  }, []);

  useEffect(() => {
    if (!alertsConfigured) return;
    let cancelled = false;
    fetchAlertsConfig()
      .then((loaded) => !cancelled && setConfig(loaded))
      .catch((cause: unknown) => {
        if (!cancelled) setConfigError(cause instanceof Error ? cause.message : 'Unknown error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Two columns, unevenly filled on purpose.
   *
   * The email card carries a form roughly three times the height of anything
   * else here, so a four-up grid of equal cells left a column of white space
   * beside it. The three short options stack into one column instead and the
   * form takes the other, which makes the two sides about the same height.
   *
   * `children` is where the zero-infrastructure options arrive from the page.
   * They belong in the stack, and they have to render on every path through
   * this component — including the ones where the alerts service is absent,
   * which is exactly when "the options that need nothing from us" matter most.
   */
  const layout = (leftLower: ReactNode, right: ReactNode = null) => (
    <div className="alert-grid alert-grid--live">
      <div className="alert-stack">
        {children}
        {leftLower}
      </div>
      {right}
    </div>
  );

  if (!alertsConfigured) return layout(<NotLiveYet />);

  if (configError) {
    return layout(
      <p className="note note--warn" role="status">
        <span>
          <b>The alerts service is not responding.</b> {configError} The two options above still work — they
          need nothing from us.
        </span>
      </p>,
    );
  }

  if (!config) return layout(<p className="privacy-note">Checking what the alerts service offers…</p>);

  return (
    <>
      {manageToken && (
        <ManageSubscription
          token={manageToken}
          catalog={catalog}
          onToast={onToast}
          onDone={() => setManageToken(null)}
        />
      )}
      {layout(
        <PushCard config={config} catalog={catalog} onToast={onToast} />,
        <EmailCard config={config} catalog={catalog} theme={theme} onToast={onToast} />,
      )}
    </>
  );
}

/**
 * The state a deployment sits in before the API has a domain.
 *
 * Said plainly rather than by rendering a disabled form: a control that looks
 * operable and is not is worse than an honest sentence.
 */
function NotLiveYet() {
  return (
    <p className="privacy-note">
      <b>Push and email alerts are built but not switched on for this deployment.</b> They need an API origin,
      which arrives with the custom domain. Until then the two options above cover the same ground without
      anyone having to store your address.
    </p>
  );
}

// ------------------------------------------------------------------ push

type PushState = 'idle' | 'working' | 'subscribed';

function PushCard({
  config,
  catalog,
  onToast,
}: {
  config: AlertsConfig;
  catalog: Catalog;
  onToast: (message: string) => void;
}) {
  // Lazy `useState` rather than `useMemo`: browser capability is fixed for the
  // life of the tab, and `useMemo` is a performance hint React is free to
  // discard and recompute. This is a value that must be computed exactly once.
  const [support] = useState(detectPushSupport);
  const [state, setState] = useState<PushState>('idle');
  const [scope, setScope] = useState<Scope>('all');
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    currentSubscription()
      .then((subscription) => subscription && setState('subscribed'))
      .catch(() => undefined);
  }, []);

  const enable = useCallback(async () => {
    setError(null);
    setState('working');
    try {
      if (!config.vapidPublicKey) throw new AlertsError('The service did not offer a push key.');
      const subscription = await createPushSubscription(config.vapidPublicKey);
      await subscribePush({ ...subscription, scope, models });
      setState('subscribed');
      onToast('Push alerts are on');
    } catch (cause) {
      // A permission denial is not a failure of ours and should not read like
      // one — it needs different words and a different remedy.
      setError(cause instanceof Error ? cause.message : 'Could not turn on push alerts.');
      setState('idle');
      if (cause instanceof PushDenied) await unsubscribeLocally().catch(() => undefined);
    }
  }, [config.vapidPublicKey, scope, models, onToast]);

  const disable = useCallback(async () => {
    setState('working');
    try {
      const endpoint = await unsubscribeLocally();
      if (endpoint) await unsubscribePush(endpoint);
      setState('idle');
      onToast('Push alerts are off');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not turn off push alerts.');
      setState('subscribed');
    }
  }, [onToast]);

  const test = useCallback(async () => {
    try {
      const subscription = await currentSubscription();
      const payload = subscription && subscriptionToPayload(subscription);
      if (!payload) throw new AlertsError('No active subscription to test.');
      await sendTestPush(payload);
      onToast('Test notification sent');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The test notification failed.');
    }
  }, [onToast]);

  const save = useCallback(async () => {
    try {
      const subscription = await currentSubscription();
      const payload = subscription && subscriptionToPayload(subscription);
      if (!payload) throw new AlertsError('No active subscription.');
      await subscribePush({ ...payload, scope, models });
      onToast('Saved what you follow');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save.');
    }
  }, [scope, models, onToast]);

  if (!support.supported) {
    return (
      <article className="alert-option">
        <h4>
          <BellIcon />
          Browser push
        </h4>
        <p>{PUSH_UNSUPPORTED[support.reason]}</p>
        <span className="alert-tag alert-tag--planned">NOT AVAILABLE HERE</span>
      </article>
    );
  }

  const blocked = permissionState() === 'denied' && state !== 'subscribed';

  return (
    <article className="alert-option alert-option--live">
      <h4>
        <BellIcon />
        Browser push
      </h4>
      <p>
        A notification the moment a price moves. Nothing personal is stored — a push subscription is an opaque
        URL the browser issues, with no address and no name attached to it.
      </p>

      <ScopeChoice
        idPrefix="push"
        scope={scope}
        onScope={setScope}
        models={models}
        onModels={setModels}
        catalog={catalog}
      />

      {blocked && (
        <p className="alerts-hint">
          Notifications are blocked for this site. Re-enable them in your browser’s site settings, then
          reload.
        </p>
      )}
      {error && (
        <p className="alerts-error" role="alert">
          {error}
        </p>
      )}

      <div className="alerts-actions">
        {state === 'subscribed' ? (
          <>
            <button type="button" className="button button--primary" onClick={save}>
              Save what I follow
            </button>
            <button type="button" className="button" onClick={test}>
              Send a test
            </button>
            <button type="button" className="button" onClick={disable}>
              Turn off
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button button--primary"
            onClick={enable}
            disabled={state === 'working' || blocked}
          >
            {state === 'working' ? 'Just a moment…' : 'Turn on push alerts'}
          </button>
        )}
      </div>
    </article>
  );
}

const PUSH_UNSUPPORTED: Record<'ios-needs-install' | 'unsupported' | 'insecure-context', string> = {
  'ios-needs-install':
    'On iPhone and iPad, web push only works once a site is added to the Home Screen. Tap Share, then “Add to Home Screen”, and open PromptSpend from there.',
  unsupported:
    'This browser does not support the Web Push standard. The email digest covers the same ground.',
  'insecure-context': 'Push needs a secure (https) connection. This page is not being served over one.',
};

// ----------------------------------------------------------------- email

function EmailCard({
  config,
  catalog,
  theme,
  onToast,
}: {
  config: AlertsConfig;
  catalog: Catalog;
  theme: 'light' | 'dark';
  onToast: (message: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [cadence, setCadence] = useState<Cadence>('weekly');
  const [scope, setScope] = useState<Scope>('all');
  const [models, setModels] = useState<string[]>([]);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!config.emailEnabled) {
    return (
      <article className="alert-option">
        <h4>
          <MailIcon />
          Email digest
        </h4>
        <p>
          Built and ready, but no sending domain is onboarded yet, so the service will not accept
          subscriptions. Browser push works today and needs no address.
        </p>
        <span className="alert-tag alert-tag--planned">AWAITING A SENDING DOMAIN</span>
      </article>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await subscribeEmail({
        email,
        cadence,
        scope,
        models,
        ...(turnstileToken ? { turnstileToken } : {}),
      });
      setSent(true);
      onToast('Check your inbox to confirm');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not subscribe.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <article className="alert-option alert-option--live">
        <h4>
          <MailIcon />
          Email digest
        </h4>
        <p>
          <b>Almost there.</b> We have sent a confirmation to <span className="mono">{email}</span>. Nothing
          else will arrive unless you click the link in it, and the address is deleted within a week if you do
          not.
        </p>
        <button type="button" className="button" onClick={() => setSent(false)}>
          Use a different address
        </button>
      </article>
    );
  }

  return (
    <article className="alert-option alert-option--live">
      <h4>
        <MailIcon />
        Email digest
      </h4>
      <p>
        A weekly “what changed in LLM pricing”, or an email the moment something moves. Double opt-in,
        one-click out, and no tracking pixels.
      </p>

      <form onSubmit={submit}>
        <label className="alerts-label" htmlFor="alerts-email">
          Email address
        </label>
        <input
          id="alerts-email"
          className="search-input alerts-input"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={254}
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <fieldset className="alerts-fieldset">
          <legend className="alerts-label">How often</legend>
          <div className="alerts-choices">
            {(
              [
                ['weekly', 'Weekly digest', 'One mail on Mondays, even in a quiet week.'],
                ['instant', 'As it happens', 'A mail whenever a price you follow moves.'],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className={`alerts-choice${cadence === value ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="alerts-cadence"
                  value={value}
                  checked={cadence === value}
                  onChange={() => setCadence(value)}
                />
                <span>
                  <b>{label}</b>
                  <small>{hint}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <ScopeChoice
          idPrefix="email"
          scope={scope}
          onScope={setScope}
          models={models}
          onModels={setModels}
          catalog={catalog}
        />

        {config.turnstileRequired && config.turnstileSiteKey && (
          <Turnstile siteKey={config.turnstileSiteKey} theme={theme} onToken={setTurnstileToken} />
        )}

        {config.turnstileRequired && !config.turnstileSiteKey && (
          <p className="alerts-error" role="alert">
            Email confirmation is temporarily unavailable because secure verification is not configured.
            Please try again later.
          </p>
        )}

        {error && (
          <p className="alerts-error" role="alert">
            {error}
          </p>
        )}

        {/* The note sits beside the button rather than under it. Stacked, it
            added two lines to the tallest card on the panel and left the column
            opposite short by exactly that much. */}
        <div className="alerts-actions alerts-actions--noted">
          <button
            type="submit"
            className="button button--primary"
            disabled={busy || (config.turnstileRequired && (!config.turnstileSiteKey || !turnstileToken))}
          >
            {busy ? 'Sending…' : 'Send me the confirmation'}
          </button>
          <p className="alerts-hint alerts-hint--beside">
            We store your address, what you follow, and the date you asked. Nothing else — no name, no IP, no
            opens, no clicks.
          </p>
        </div>
      </form>
    </article>
  );
}

// ------------------------------------------------------------ management

function ManageSubscription({
  token,
  catalog,
  onToast,
  onDone,
}: {
  token: string;
  catalog: Catalog;
  onToast: (message: string) => void;
  onDone: () => void;
}) {
  const [prefs, setPrefs] = useState<EmailPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cadence, setCadence] = useState<Cadence>('weekly');
  const [scope, setScope] = useState<Scope>('all');
  const [models, setModels] = useState<string[]>([]);
  const loaded = useRef(false);

  /**
   * Unsubscribing is destructive, immediate, and sat behind a single click next
   * to "Save preferences" — then closed the panel, so the only feedback was a
   * toast on a screen that had just changed under you. It now asks first and
   * confirms afterwards, matching the page the emailed unsubscribe link serves.
   */
  const [phase, setPhase] = useState<'editing' | 'confirming' | 'unsubscribed'>('editing');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchPreferences(token)
      .then((result) => {
        setPrefs(result);
        if (!loaded.current) {
          setCadence(result.cadence);
          setScope(result.scope);
          setModels(result.models);
          loaded.current = true;
        }
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Unknown error'));
  }, [token]);

  if (error) {
    return (
      <section className="panel span-2 alerts-manage">
        <div className="panel__body">
          <p className="note note--warn" role="status">
            <span>
              <b>That management link could not be opened.</b> {error} Links are signed and time-limited, so a
              very old one stops working.
            </span>
          </p>
          <button type="button" className="button" onClick={onDone}>
            Dismiss
          </button>
        </div>
      </section>
    );
  }

  if (!prefs) return null;

  if (phase === 'unsubscribed') {
    return (
      <section className="panel span-2 alerts-manage" aria-labelledby="manage-title">
        <div className="panel__head">
          <h2 className="panel__title" id="manage-title">
            You&apos;re unsubscribed
          </h2>
        </div>
        <div className="panel__body">
          <p role="status">
            <b>
              <span className="mono">{prefs.email}</span> will not receive any more PromptSpend price alerts.
            </b>{' '}
            It took effect immediately — there is no &ldquo;up to 10 days&rdquo; here.
          </p>
          <p className="alerts-hint">
            Your address and the list of models you followed have been deleted, not flagged. If you subscribe
            again later it starts fresh.
          </p>
          <div className="alerts-actions">
            <button type="button" className="button button--primary" onClick={onDone}>
              Close
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel span-2 alerts-manage" aria-labelledby="manage-title">
      <div className="panel__head">
        <h2 className="panel__title" id="manage-title">
          Your email alerts
        </h2>
      </div>
      <div className="panel__body">
        <p>
          Managing <span className="mono">{prefs.email}</span>
          {prefs.status !== 'active' && <> — currently {prefs.status}</>}.
        </p>

        {phase === 'confirming' && (
          <div className="alerts-confirm" role="alertdialog" aria-label="Confirm unsubscribe">
            <p>
              <b>Stop sending price alerts to this address?</b> Your address and the models you follow are
              deleted, not just switched off.
            </p>
            <div className="alerts-actions">
              <button
                type="button"
                className="button button--danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await unsubscribeByToken(token);
                    setPhase('unsubscribed');
                    onToast('Unsubscribed');
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Could not unsubscribe.');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Unsubscribing…' : 'Yes, unsubscribe me'}
              </button>
              <button type="button" className="button" disabled={busy} onClick={() => setPhase('editing')}>
                Keep my subscription
              </button>
            </div>
          </div>
        )}

        <fieldset className="alerts-fieldset">
          <legend className="alerts-label">How often</legend>
          <div className="alerts-choices">
            {(
              [
                ['weekly', 'Weekly digest'],
                ['instant', 'As it happens'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className={`alerts-choice${cadence === value ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="manage-cadence"
                  checked={cadence === value}
                  onChange={() => setCadence(value)}
                />
                <span>
                  <b>{label}</b>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <ScopeChoice
          idPrefix="manage"
          scope={scope}
          onScope={setScope}
          models={models}
          onModels={setModels}
          catalog={catalog}
        />

        <div className="alerts-actions">
          <button
            type="button"
            className="button button--primary"
            onClick={async () => {
              try {
                await savePreferences(token, { cadence, scope, models });
                onToast('Preferences saved');
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : 'Could not save.');
              }
            }}
          >
            Save preferences
          </button>
          <button
            type="button"
            className="button"
            disabled={phase === 'confirming'}
            onClick={() => {
              setPhase('confirming');
            }}
          >
            Unsubscribe
          </button>
          <button type="button" className="button" onClick={onDone}>
            Close
          </button>
        </div>
      </div>
    </section>
  );
}

// -------------------------------------------------------------- controls

/**
 * "Everything" versus "just these", with the model picker only mounted for the
 * branch that uses it. Rendering a disabled list of sixty models under an
 * unselected radio is noise the whole time it is not wanted.
 */
function ScopeChoice({
  idPrefix,
  scope,
  onScope,
  models,
  onModels,
  catalog,
}: {
  idPrefix: string;
  scope: Scope;
  onScope: (scope: Scope) => void;
  models: string[];
  onModels: (models: string[]) => void;
  catalog: Catalog;
}) {
  return (
    <fieldset className="alerts-fieldset">
      <legend className="alerts-label">What to watch</legend>
      <div className="alerts-choices">
        {(
          [
            ['all', 'Everything', 'Any model in the catalog.'],
            ['followed', 'Just these', 'Only the models you pick.'],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={value} className={`alerts-choice${scope === value ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name={`${idPrefix}-scope`}
              checked={scope === value}
              onChange={() => onScope(value)}
            />
            <span>
              <b>{label}</b>
              <small>{hint}</small>
            </span>
          </label>
        ))}
      </div>
      {scope === 'followed' && <ModelPicker catalog={catalog} selected={models} onChange={onModels} />}
    </fieldset>
  );
}

const MAX_FOLLOWS = 40;

function ModelPicker({
  catalog,
  selected,
  onChange,
}: {
  catalog: Catalog;
  selected: string[];
  onChange: (models: string[]) => void;
}) {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.primaryModels.filter((model) => {
      if (!needle) return true;
      return (
        model.displayName.toLowerCase().includes(needle) ||
        catalog.providerName(model).toLowerCase().includes(needle)
      );
    });
  }, [catalog, query]);

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((entry) => entry !== id));
    else if (selected.length < MAX_FOLLOWS) onChange([...selected, id]);
  };

  return (
    <div className="alerts-picker">
      <input
        className="search-input alerts-input"
        type="search"
        placeholder="Filter models…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Filter the model list"
      />
      <p className="alerts-hint" aria-live="polite">
        {selected.length} of {MAX_FOLLOWS} selected
        {selected.length >= MAX_FOLLOWS && ' — that is the maximum'}
      </p>
      <ul className="alerts-picker__list">
        {visible.map((model) => {
          const checked = selected.includes(model.id);
          return (
            <li key={model.id}>
              <label className={checked ? 'is-selected' : undefined}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(model.id)}
                  disabled={!checked && selected.length >= MAX_FOLLOWS}
                />
                <Flag country={catalog.provider(model)?.country} />
                <span className="alerts-picker__name">{model.displayName}</span>
                <span className="alerts-picker__provider">{catalog.providerName(model)}</span>
              </label>
            </li>
          );
        })}
        {visible.length === 0 && <li className="alerts-picker__empty">No model matches “{query}”.</li>}
      </ul>
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a7 7 0 0 0-7 7c0 5-2 6-2 6h18s-2-1-2-6a7 7 0 0 0-7-7zM10.5 20a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 6L2 7" />
    </svg>
  );
}
