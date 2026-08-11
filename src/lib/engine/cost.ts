/**
 * Compatibility export for the web app, API, and existing public imports.
 *
 * The implementation is platform-neutral and lives in packages/core so the
 * native app executes the exact same pricing rules instead of maintaining a
 * second calculator.
 */
export * from '../../../packages/core/src/engine/cost';
