declare const __APP_URL__: string;
declare const __EXT_VERSION__: string;

export const APP_URL = __APP_URL__;
export const EXT_VERSION = __EXT_VERSION__;

/**
 * What the configured server can do. Discovered at runtime from
 * GET /api/capabilities, never hardcoded — see that route for why.
 *
 * Everything defaults to OFF, which is also what a static deployment (no
 * server at all) reports by failing to answer. Thicket is a complete on-device
 * product in that state; the paid tier simply isn't offered, rather than being
 * offered and broken.
 */
export interface Capabilities {
  accounts: boolean;
  ai: boolean;
  embeddings: boolean;
  billing: boolean;
}

export const NO_CAPABILITIES: Capabilities = {
  accounts: false,
  ai: false,
  embeddings: false,
  billing: false,
};
