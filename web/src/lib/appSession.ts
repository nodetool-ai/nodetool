/**
 * The credential a deployed mini app's page runs on.
 *
 * A visitor to `/a/:token` has no account here. The page trades the
 * deployment token for a short-lived session token that authenticates as the
 * app's owner for that one app's runs, and everything the page does over the
 * websocket carries it instead of a Supabase session.
 *
 * It lives in a module rather than in a store because the two readers are not
 * React: `GlobalWebSocketManager` builds its URL from outside the component
 * tree, and it re-reads on every reconnect, so a refreshed token is picked up
 * without reconnecting anything by hand. Nothing persists it — a reload mints
 * a new one from the deployment token in the URL, which is the only thing
 * that outlives the tab.
 */

let sessionToken: string | null = null;

/** Hand the websocket layer the session to connect with, or clear it. */
export const setAppSessionToken = (token: string | null): void => {
  sessionToken = token;
};

export const getAppSessionToken = (): string | null => sessionToken;

/** Whether this page is a deployed app's public page. */
export const isAppSessionActive = (): boolean => sessionToken !== null;
