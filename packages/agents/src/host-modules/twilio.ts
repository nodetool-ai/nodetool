/**
 * `@nodetool-ai/sandbox-twilio` — Twilio's request shape, on the host.
 *
 * Twilio is HTTP Basic auth over form-encoded bodies, on a URL that buries the
 * account SID in the path. None of that is hard; all of it is easy to get
 * wrong once, and the failure is a 401 that names nothing. The helper builds
 * the request; the guest sends it.
 */

import { optionsOf } from "./limits.js";
import {
  base64Utf8,
  formBody,
  methodOf,
  requireString,
  withQuery,
  type PreparedRequest
} from "./prepared-request.js";

/** The API version every Account resource path carries. */
const ACCOUNT_API_VERSION = "2010-04-01";

/**
 * Build an authenticated Twilio request.
 *
 * ```js
 * import { request } from "@nodetool-ai/sandbox-twilio";
 *
 * const req = await request({
 *   accountSid: await nodetool.secrets.get("TWILIO_ACCOUNT_SID"),
 *   authToken: await nodetool.secrets.get("TWILIO_AUTH_TOKEN"),
 *   path: "Messages.json",
 *   method: "POST",
 *   params: { To: "+15551234567", From: "+15559876543", Body: "shipped" }
 * });
 * const res = await fetch(req.url, req);
 * ```
 *
 * A `path` without a leading slash is an Account resource and is placed under
 * `/2010-04-01/Accounts/<sid>/`. One with a leading slash is used as written,
 * which is how the other products are reached — pass
 * `{ host: "lookups.twilio.com", path: "/v2/PhoneNumbers/+15551234567" }`.
 *
 * `params` become the form body on a write and the query string on a read.
 */
export async function request(options?: unknown): Promise<PreparedRequest> {
  const where = "twilio.request";
  const opts = optionsOf(options);
  const accountSid = requireString(where, opts.accountSid, "accountSid");
  const authToken = requireString(where, opts.authToken, "authToken");
  const path = requireString(where, opts.path, "path");
  const method = methodOf(opts.method, "GET");
  const host = String(opts.host ?? "api.twilio.com");
  if (!/^[a-z0-9.-]+\.twilio\.com$/.test(host)) {
    throw new Error(`${where}: host must be a twilio.com host, got "${host}"`);
  }

  const url = new URL(
    path.startsWith("/")
      ? path
      : `/${ACCOUNT_API_VERSION}/Accounts/${encodeURIComponent(accountSid)}/${path}`,
    `https://${host}`
  );

  const headers: Record<string, string> = {
    Authorization: `Basic ${base64Utf8(`${accountSid}:${authToken}`)}`
  };

  if (method === "GET" || method === "DELETE") {
    withQuery(url, opts.params);
    withQuery(url, opts.query);
    return { url: url.toString(), method, headers };
  }

  withQuery(url, opts.query);
  headers["Content-Type"] = "application/x-www-form-urlencoded";
  return {
    url: url.toString(),
    method,
    headers,
    body: formBody(where, opts.params)
  };
}
