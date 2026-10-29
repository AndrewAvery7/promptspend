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
