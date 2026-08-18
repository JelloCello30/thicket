declare const __APP_URL__: string;
declare const __EXT_VERSION__: string;

export const APP_URL = __APP_URL__;
export const EXT_VERSION = __EXT_VERSION__;

/**
 * Accounts, sync, and server-side AI are switched OFF until a backend exists.
 *
 * Nothing behind them is deployed, so every control that depends on one would
 * either fail or, worse, quietly send the user to a sign-in page that cannot
 * work. Thicket is a complete on-device product without them; offering them
 * would be the only dishonest thing in the interface. Flip this to true in the
 * same change that ships the server.
 */
export const ACCOUNTS_ENABLED = false;
