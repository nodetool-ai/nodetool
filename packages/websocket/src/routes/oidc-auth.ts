/**
 * OpenID Connect single sign-on routes, registered only when `OIDC_ISSUER` and
 * `OIDC_CLIENT_ID` are set (see `docs/authentication.md#single-sign-on-oidc`).
 *
 *   GET /api/auth/oidc/login     → 302 to the identity provider
 *   GET /api/auth/oidc/callback  → 302 back to the web app with a session
 *
 * Both are auth-exempt (`isPublicOidcAuthRequest`). The login route writes a
 * signed, HttpOnly cookie holding the state, nonce and PKCE verifier; the
 * callback accepts a code only when its `state` matches that cookie, so a
 * sign-in cannot be started on one browser and finished on another. The
 * cookie is the only state, so any replica can finish a sign-in that another
 * one started.
 *
 * The session token goes back to the web app in the URL fragment, which the
 * browser never sends to a server or puts in a `Referer`. The web app moves it
 * to local storage and strips it from the address bar.
 */

import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { createLogger } from "@nodetool-ai/config";
import { recordSignIn } from "@nodetool-ai/models";
import {
  OIDC_CALLBACK_PATH,
  OIDC_LOGIN_PATH,
  OIDC_LOGIN_STATE_TTL_SECONDS,
  OidcSignInError,
  createOidcLoginState,
  mintOidcSessionToken,
  openOidcLoginState,
  safeEqual,
  sealOidcLoginState,
  type OidcClient
} from "@nodetool-ai/auth";

import { forgetAccountStatus } from "../lib/user-directory.js";

const log = createLogger("nodetool.websocket.oidc");

/** Cookie carrying the in-flight sign-in. Scoped to the two OIDC routes. */
export const OIDC_LOGIN_COOKIE = "nodetool_oidc_login";
const COOKIE_PATH = "/api/auth/oidc";

/** Fragment keys the web app reads after the redirect. */
export const SSO_TOKEN_FRAGMENT = "nodetool_sso";
export const SSO_ERROR_FRAGMENT = "nodetool_sso_error";

export interface OidcAuthRouteOptions {
  client: OidcClient;
  /** HMAC key for the login-state cookie. */
  loginStateKey: () => Buffer | string;
  /** HMAC key for the session tokens the auth hook verifies. */
  sessionKey: () => Buffer | string;
  now?: () => number;
}

/** Read one cookie from a `Cookie` header. */
export function readCookie(
  header: string | undefined,
  name: string
): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function loginCookie(value: string, maxAge: number, secure: boolean): string {
  return [
    `${OIDC_LOGIN_COOKIE}=${value}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAge}`,
    "HttpOnly",
    // Lax still sends the cookie on the identity provider's top-level GET
    // redirect back to the callback, and on nothing cross-site beyond that.
    "SameSite=Lax",
    ...(secure ? ["Secure"] : [])
  ].join("; ");
}

/** `postLoginUrl` with one fragment parameter, replacing any fragment. */
function withFragment(base: string, key: string, value: string): string {
  const url = new URL(base);
  url.hash = `${key}=${encodeURIComponent(value)}`;
  return url.toString();
}

const queryString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const oidcAuthRoutes: FastifyPluginAsync<OidcAuthRouteOptions> = async (
  app,
  opts
) => {
  const { client, loginStateKey, sessionKey } = opts;
  const now = opts.now ?? Date.now;
  const { config } = client;

  const fail = (reply: FastifyReply, code: string): FastifyReply => {
    reply.header(
      "Set-Cookie",
      loginCookie("", 0, config.secureCookie)
    );
    reply.header("Cache-Control", "no-store");
    return reply.redirect(
      withFragment(config.postLoginUrl, SSO_ERROR_FRAGMENT, code)
    );
  };

  app.get(OIDC_LOGIN_PATH, async (_req, reply) => {
    const loginState = createOidcLoginState(now);
    let target: string;
    try {
      target = await client.authorizationUrl(loginState);
    } catch (error) {
      log.error("SSO sign-in could not reach the identity provider", {
        error: error instanceof Error ? error.message : String(error)
      });
      return fail(reply, "provider_unavailable");
    }
    reply.header(
      "Set-Cookie",
      loginCookie(
        sealOidcLoginState(loginStateKey(), loginState),
        OIDC_LOGIN_STATE_TTL_SECONDS,
        config.secureCookie
      )
    );
    reply.header("Cache-Control", "no-store");
    return reply.redirect(target);
  });

  app.get(OIDC_CALLBACK_PATH, async (req, reply) => {
    const query = (req.query ?? {}) as Record<string, unknown>;
    const providerError = queryString(query["error"]);
    if (providerError) {
      log.warn("The identity provider ended the SSO sign-in with an error", {
        error: providerError.slice(0, 100),
        description: queryString(query["error_description"])?.slice(0, 300)
      });
      return fail(reply, providerError === "access_denied" ? "access_denied" : "provider_error");
    }

    const loginState = openOidcLoginState(
      loginStateKey(),
      readCookie(req.headers.cookie, OIDC_LOGIN_COOKIE),
      now
    );
    const state = queryString(query["state"]);
    const code = queryString(query["code"]);
    if (!loginState || !state || !safeEqual(state, loginState.state)) {
      // An expired attempt, a second tab, or a forged callback. Starting over
      // is the fix in every case.
      return fail(reply, "invalid_state");
    }
    if (!code) {
      return fail(reply, "invalid_request");
    }

    try {
      const identity = await client.completeSignIn(code, loginState);
      const account = await recordSignIn({
        userId: identity.userId,
        email: identity.email ?? null,
        displayName: identity.name ?? null,
        authSource: "oidc",
        groups: identity.groups
      });
      if (account.status !== "active") {
        log.warn("SSO sign-in refused for a disabled account", {
          userId: identity.userId
        });
        return fail(reply, "account_disabled");
      }
      forgetAccountStatus(identity.userId);
      const session = await mintOidcSessionToken(
        sessionKey(),
        { userId: identity.userId, email: identity.email, name: identity.name },
        config.sessionTtlSeconds,
        now
      );
      log.info("SSO sign-in", { userId: identity.userId });
      reply.header("Set-Cookie", loginCookie("", 0, config.secureCookie));
      reply.header("Cache-Control", "no-store");
      return reply.redirect(
        withFragment(config.postLoginUrl, SSO_TOKEN_FRAGMENT, session.token)
      );
    } catch (error) {
      if (error instanceof OidcSignInError) {
        log.warn("SSO sign-in refused", { code: error.code, reason: error.message });
        return fail(reply, error.code);
      }
      log.error("SSO sign-in failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return fail(reply, "provider_unavailable");
    }
  });
};

export default oidcAuthRoutes;
