/**
 * Public app deployments: serving one released mini app from an unguessable
 * URL that needs no login.
 *
 * The deployment is a token, not a permission bit. A visitor who has the URL
 * gets the app's **released** snapshot and may run it; nothing else about the
 * owner's account is reachable through it. The rules that make that true live
 * on the server; what lives here is the shape both ends agree on and the one
 * predicate that decides whether the surface exists at all.
 *
 * It exists only in production. A local install answers loopback (and, when
 * configured, the local network) as user "1" with no credentials, so a link
 * that "needs no login" there is indistinguishable from the whole account
 * being open — the hidden URL would add a second, quieter door onto a house
 * that is already unlocked. Production is where auth is enforced, where asset
 * bytes are served through signed URLs a logged-out browser can load, and
 * where an app's spend budget is the thing standing between a shared link and
 * the owner's provider bill.
 */

import { PRODUCTION_ENV_VALUE } from "./cloud-profile.js";

/**
 * Whether public app deployments are offered by a server running with this
 * `NODETOOL_ENV`. The caller passes the raw env value so this stays a pure
 * function of it and can be tested without mutating `process.env`.
 */
export function isAppDeploymentEnabled(
  nodeEnvValue: string | undefined | null
): boolean {
  return nodeEnvValue === PRODUCTION_ENV_VALUE;
}

/** Path prefix the public, unauthenticated deployment routes live under. */
export const APP_DEPLOYMENT_PATH_PREFIX = "/api/apps/";

/** Client route that renders a deployed app, by deployment token. */
export function appDeploymentPath(token: string): string {
  return `/a/${token}`;
}

/**
 * How long a minted run session lasts. Long enough that a visitor filling in a
 * form does not lose the session mid-thought, short enough that a token
 * scraped from a network log is worth little. A page that outlives it mints
 * another; nothing about the deployment itself expires.
 */
export const APP_DEPLOYMENT_SESSION_TTL_SECONDS = 60 * 60;
