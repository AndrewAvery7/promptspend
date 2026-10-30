jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// @expo/vector-icons loads its glyph font through expo-font when an icon
// mounts. Under jest-expo 58 the asset registry that expo-asset consults has no
// entry for the font module, so the load rejects ("Module is missing from the
// asset registry") and fails whichever test rendered an icon. No test depends
// on a real font, so treat every font as already loaded.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  isLoaded: jest.fn(() => true),
  loadAsync: jest.fn(() => Promise.resolve()),
}));

// Firebase Analytics is a native module that does not exist under jest. Every
// call resolves and is recorded, so tests can check exactly what would be sent.
jest.mock('@react-native-firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
  logEvent: jest.fn(() => Promise.resolve()),
  logScreenView: jest.fn(() => Promise.resolve()),
  resetAnalyticsData: jest.fn(() => Promise.resolve()),
  setAnalyticsCollectionEnabled: jest.fn(() => Promise.resolve()),
}));
