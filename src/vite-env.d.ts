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

/**
 * Written into the build by `vite.config.ts`: the catalog's freshness figures
 * and the rendered freshness tape, as they stood when it was built. The Receipt
 * page shows them until its own fetch of the catalog returns; null if the build
 * could not read the data.
 */
declare const __PS_FRESHNESS__: {
  pricesChangedOn: string | null;
  sourcesCheckedOn: string | null;
  degraded: boolean;
} | null;
declare const __PS_TICKER_HTML__: string | null;
