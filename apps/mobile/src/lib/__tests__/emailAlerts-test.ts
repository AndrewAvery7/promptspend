import {
  alertDraftValidationMessage,
  emailValidationMessage,
  requestEmailManagementCode,
  subscribeEmailAlerts,
} from '@/lib/emailAlerts';

describe('native email alert client', () => {
  afterEach(() => jest.restoreAllMocks());

  test('validates addresses and followed-model selection before network use', () => {
    expect(emailValidationMessage('')).toMatch(/Enter/);
    expect(emailValidationMessage('not-an-address')).toMatch(/complete/);
    expect(emailValidationMessage('reader@example.com')).toBeNull();
    expect(
      alertDraftValidationMessage({
        cadence: 'weekly',
        email: 'reader@example.com',
        models: [],
        scope: 'followed',
      }),
    ).toMatch(/Choose at least one/);
  });

  test('sends only alert preferences and the isolated Turnstile result', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, pending: true }), { status: 200 }));
    await subscribeEmailAlerts(
      { cadence: 'instant', email: 'reader@example.com', models: ['claude-sonnet-5'], scope: 'followed' },
      'turnstile-token-safe-for-test',
    );
    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual({
      cadence: 'instant',
      client: 'mobile',
      email: 'reader@example.com',
      models: ['claude-sonnet-5'],
      scope: 'followed',
      turnstileAction: 'mobile_email_alerts',
      turnstileToken: 'turnstile-token-safe-for-test',
    });
    expect(JSON.stringify(body)).not.toContain('prompt');
  });

  test('management request has an enumeration-resistant client shape', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true, pending: true }), { status: 200 }));
    await requestEmailManagementCode('reader@example.com', 'turnstile-token-safe-for-test');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      client: 'mobile',
      email: 'reader@example.com',
      turnstileAction: 'mobile_email_alerts',
      turnstileToken: 'turnstile-token-safe-for-test',
    });
  });
});
