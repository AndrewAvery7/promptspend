import { WebDocumentHead } from '../WebDocumentHead';

describe('WebDocumentHead on native', () => {
  test('does not register Expo Head or an iOS Handoff activity', () => {
    expect(
      WebDocumentHead({
        description: 'Private cost estimate',
        title: 'PromptSpend',
      }),
    ).toBeNull();
  });
});
