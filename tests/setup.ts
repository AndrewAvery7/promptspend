import '@testing-library/jest-dom/vitest';

// jsdom implements no layout, so scroll APIs the app legitimately uses are
// absent. Stub them here rather than weakening the components with guards that
// only exist to satisfy the test environment.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
