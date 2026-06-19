/**
 * LocalCallbackServer — a single-shot localhost HTTP listener that receives the
 * OAuth redirect, validates the CSRF `state`, and resolves with the
 * authorization code.
 *
 * Lifecycle is explicit: `listen()` → `waitForCode()` → `close()`. The server
 * binds to loopback only, serves exactly one callback, and then becomes inert.
 * No module-level state — each login owns its own instance.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import type { Logger } from "@nodetool-ai/config";
import {
  AuthorizationDeniedError,
  CallbackTimeoutError,
  OAuthError,
  StateMismatchError
} from "./errors.js";
import type { AuthorizationResult } from "./types.js";

export interface LocalCallbackServerOptions {
  /** Loopback host to bind. Defaults to 127.0.0.1. */
  readonly host?: string;
  /** Port to bind. 0 (default) lets the OS pick an ephemeral port. */
  readonly port?: number;
  /** Callback path the authorization server will redirect to. */
  readonly path?: string;
  /** HTML shown in the browser after a successful callback. */
  readonly successHtml?: string;
  /** HTML shown in the browser after a failed callback. */
  readonly failureHtml?: string;
  readonly logger?: Logger;
}

const DEFAULT_SUCCESS_HTML =
  "<!doctype html><meta charset=utf-8><title>NodeTool</title>" +
  "<body style=\"font-family:system-ui;text-align:center;padding-top:3rem\">" +
  "<h2>Authentication complete</h2><p>You can close this tab and return to NodeTool.</p></body>";

const DEFAULT_FAILURE_HTML =
  "<!doctype html><meta charset=utf-8><title>NodeTool</title>" +
  "<body style=\"font-family:system-ui;text-align:center;padding-top:3rem\">" +
  "<h2>Authentication failed</h2><p>You can close this tab and return to NodeTool.</p></body>";

export interface WaitForCodeOptions {
  /** The exact `state` value sent in the authorization request (CSRF guard). */
  readonly expectedState: string;
  /** Abort if no callback arrives within this many milliseconds. */
  readonly timeoutMs: number;
  /** External cancellation (e.g. user cancels the flow). */
  readonly signal?: AbortSignal;
}

export class LocalCallbackServer {
  private readonly host: string;
  private readonly requestedPort: number;
  private readonly path: string;
  private readonly successHtml: string;
  private readonly failureHtml: string;
  private readonly logger?: Logger;
  private server: Server | null = null;
  private boundPort: number | null = null;

  constructor(options: LocalCallbackServerOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.requestedPort = options.port ?? 0;
    this.path = options.path ?? "/callback";
    this.successHtml = options.successHtml ?? DEFAULT_SUCCESS_HTML;
    this.failureHtml = options.failureHtml ?? DEFAULT_FAILURE_HTML;
    this.logger = options.logger;
  }

  /** Start listening. Resolves with the bound port and full redirect URI. */
  async listen(): Promise<{ port: number; redirectUri: string }> {
    if (this.server) {
      throw new OAuthError("token_exchange_failed", "Callback server already listening");
    }
    const server = createServer();
    this.server = server;

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        server.removeListener("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        server.removeListener("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.requestedPort, this.host);
    });

    const address = server.address() as AddressInfo;
    this.boundPort = address.port;
    this.logger?.debug("Callback server listening", { host: this.host, port: address.port });
    return { port: address.port, redirectUri: this.redirectUri() };
  }

  /** The redirect URI to register with the authorization server. */
  redirectUri(): string {
    if (this.boundPort == null) {
      throw new OAuthError("token_exchange_failed", "Callback server is not listening yet");
    }
    return `http://${this.host}:${this.boundPort}${this.path}`;
  }

  /**
   * Resolve when the browser hits the callback path with a matching `state`
   * and an authorization `code`. Rejects on timeout, CSRF mismatch, an
   * `error` param from the server, or external abort.
   */
  async waitForCode(options: WaitForCodeOptions): Promise<AuthorizationResult> {
    const server = this.server;
    if (!server) {
      throw new OAuthError("token_exchange_failed", "Callback server is not listening");
    }

    return new Promise<AuthorizationResult>((resolve, reject) => {
      let settled = false;

      const onAbort = () => finish(() => reject(new OAuthError("callback_timeout", "Login aborted")));

      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        server.removeListener("request", onRequest);
        action();
      };

      const timer = setTimeout(() => {
        finish(() => reject(new CallbackTimeoutError()));
      }, options.timeoutMs);

      const onRequest = (req: IncomingMessage, res: ServerResponse) => {
        // Reconstruct the URL; host header is irrelevant for loopback parsing.
        const url = new URL(req.url ?? "/", `http://${this.host}`);
        if (url.pathname !== this.path) {
          res.writeHead(404).end();
          return;
        }

        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (error) {
          this.respond(res, false);
          const denied =
            error === "access_denied"
              ? new AuthorizationDeniedError()
              : new OAuthError("authorization_denied", `Authorization server returned error: ${error}`);
          finish(() => reject(denied));
          return;
        }

        // CSRF: validate state BEFORE trusting the code.
        if (!state || state !== options.expectedState) {
          this.respond(res, false);
          finish(() => reject(new StateMismatchError()));
          return;
        }

        if (!code) {
          this.respond(res, false);
          finish(() => reject(new OAuthError("authorization_denied", "Callback missing authorization code")));
          return;
        }

        this.respond(res, true);
        finish(() => resolve({ code, state }));
      };

      server.on("request", onRequest);

      if (options.signal) {
        if (options.signal.aborted) {
          onAbort();
          return;
        }
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }

  /** Stop listening and release the port. Idempotent. */
  async close(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    this.boundPort = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private respond(res: ServerResponse, ok: boolean): void {
    res.writeHead(ok ? 200 : 400, { "content-type": "text/html; charset=utf-8" });
    res.end(ok ? this.successHtml : this.failureHtml);
  }
}
