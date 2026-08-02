/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Origin of the alerts API, e.g. `https://alerts.promptspend.dev`.
   * Empty (the default) disables the alerts UI rather than breaking it.
   */
  readonly VITE_ALERTS_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
