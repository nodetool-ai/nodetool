/**
 * Tests for `resolveHfHubAccess`: the Hub host and token for one user's
 * search or download. Server credentials go only to the operator endpoint.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as os from "node:os";

import { registerUserCredentialKey } from "@nodetool-ai/config";
import { resolveHfHubAccess, isSharedHfHost, clearHfTokenCache } from "../src/hf-auth.js";

const ENV_KEYS = [
  "HF_TOKEN",
  "HF_API_TOKEN",
  "HUGGING_FACE_HUB_TOKEN",
  "HF_TOKEN_PATH",
  "HF_HOME",
  "HF_ENDPOINT",
  "NODETOOL_ENV",
  "NODETOOL_NODE_PROFILE",
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID"
];

const MIRROR = "https://mirror.example.com";
const PUBLIC_HUB = "https://huggingface.co";

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env["HF_HOME"] = path.join(os.tmpdir(), "hf-hub-access-no-dir");
  process.env["HF_TOKEN"] = "hf_server";
  clearHfTokenCache();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  clearHfTokenCache();
});

function secrets(values: Record<string, string>) {
  return async (key: string) => values[key] ?? null;
}

describe("resolveHfHubAccess", () => {
  it("sends the server token to the public Hub when the user set nothing", async () => {
    expect(await resolveHfHubAccess(secrets({}), "search")).toEqual({
      endpoint: PUBLIC_HUB,
      token: "hf_server",
      userEndpoint: false
    });
  });

  it("sends the server token to the operator's HF_ENDPOINT", async () => {
    process.env["HF_ENDPOINT"] = `${MIRROR}/`;
    expect(await resolveHfHubAccess(secrets({}), "download")).toEqual({
      endpoint: MIRROR,
      token: "hf_server",
      userEndpoint: false
    });
  });

  it("treats a user endpoint equal to the operator's as the operator endpoint", async () => {
    const access = await resolveHfHubAccess(
      secrets({ HF_ENDPOINT: `${PUBLIC_HUB}/` }),
      "search"
    );
    expect(access).toEqual({ endpoint: PUBLIC_HUB, token: "hf_server", userEndpoint: false });
  });

  it("withholds the server token from an endpoint the user set", async () => {
    for (const use of ["search", "download"] as const) {
      expect(await resolveHfHubAccess(secrets({ HF_ENDPOINT: MIRROR }), use)).toEqual({
        endpoint: MIRROR,
        token: undefined,
        userEndpoint: true
      });
    }
  });

  it("sends the user's own token to the endpoint the user set", async () => {
    const access = await resolveHfHubAccess(
      secrets({ HF_ENDPOINT: MIRROR, HF_TOKEN: " hf_user " }),
      "search"
    );
    expect(access).toEqual({ endpoint: MIRROR, token: "hf_user", userEndpoint: true });
  });

  it("prefers the user's token on the operator endpoint", async () => {
    const access = await resolveHfHubAccess(secrets({ HF_TOKEN: "hf_user" }), "search");
    expect(access.token).toBe("hf_user");
  });

  it("falls back to the operator endpoint when the secret store throws", async () => {
    const access = await resolveHfHubAccess(async () => {
      throw new Error("locked");
    }, "search");
    expect(access).toEqual({ endpoint: PUBLIC_HUB, token: "hf_server", userEndpoint: false });
  });

  it.each([
    ["the cloud profile", { NODETOOL_NODE_PROFILE: "cloud" }],
    ["enforced auth", { OIDC_ISSUER: "https://id.example.com", OIDC_CLIENT_ID: "c" }]
  ])("downloads use the operator endpoint under %s", async (_label, env) => {
    Object.assign(process.env, env);
    expect(isSharedHfHost()).toBe(true);

    const download = await resolveHfHubAccess(
      secrets({ HF_ENDPOINT: MIRROR, HF_TOKEN: "hf_user" }),
      "download"
    );
    expect(download).toEqual({ endpoint: PUBLIC_HUB, token: "hf_user", userEndpoint: false });

    // A search writes nothing shared, so it keeps the user's endpoint.
    const search = await resolveHfHubAccess(secrets({ HF_ENDPOINT: MIRROR }), "search");
    expect(search).toEqual({ endpoint: MIRROR, token: undefined, userEndpoint: true });
  });

  it("keeps the user's endpoint for downloads on a single-user install", async () => {
    expect(isSharedHfHost()).toBe(false);
    const access = await resolveHfHubAccess(secrets({ HF_ENDPOINT: MIRROR }), "download");
    expect(access.endpoint).toBe(MIRROR);
  });

  it("withholds the server token on the cloud profile once HF_TOKEN is a user credential", async () => {
    registerUserCredentialKey("HF_TOKEN");
    process.env["NODETOOL_NODE_PROFILE"] = "cloud";
    const access = await resolveHfHubAccess(secrets({}), "search");
    expect(access).toEqual({ endpoint: PUBLIC_HUB, token: undefined, userEndpoint: false });

    process.env["NODETOOL_NODE_PROFILE"] = "full";
    expect((await resolveHfHubAccess(secrets({}), "search")).token).toBe("hf_server");
  });
});
