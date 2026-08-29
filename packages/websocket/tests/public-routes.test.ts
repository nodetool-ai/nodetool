/**
 * The auth-exemption allowlist is the boundary between "anyone who can reach
 * the port" and the local user's data, so these tests pin down exactly which
 * paths skip authentication.
 */
import { describe, it, expect } from "vitest";
import {
  isPublicAppDeploymentRequest,
  isPublicOAuthRequest,
  isPublicWorkflowMetadataRequest,
  isPublicAuthExemptRoute
} from "../src/lib/public-routes.js";

describe("isPublicWorkflowMetadataRequest", () => {
  it("exempts shipped examples and explicitly-public workflows", () => {
    for (const path of [
      "/api/workflows/public",
      "/api/workflows/public/wf-123",
      "/api/workflows/examples",
      "/api/workflows/examples/search",
      "/api/workflows/examples/thumbnails/foo.png"
    ]) {
      expect(isPublicWorkflowMetadataRequest(path, "GET")).toBe(true);
    }
  });

  it("keeps the caller's own library behind auth", () => {
    // These resolve identity from the server-set x-user-id header and fall
    // back to user "1", so exempting them discloses private workflows —
    // graph included — to any unauthenticated caller.
    for (const path of [
      "/api/workflows",
      "/api/workflows/",
      "/api/workflows/wf-123",
      "/api/workflows/names",
      "/api/workflows/tools",
      "/api/workflows/wf-123/dsl-export"
    ]) {
      expect(isPublicWorkflowMetadataRequest(path, "GET")).toBe(false);
    }
  });

  it("does not exempt a private id that merely starts with a public prefix", () => {
    // `publications` / `examples-of-mine` share a prefix with the allowlist
    // but are ordinary workflow ids, so a startsWith check without the
    // trailing separator would leak them.
    expect(
      isPublicWorkflowMetadataRequest("/api/workflows/publications", "GET")
    ).toBe(false);
    expect(
      isPublicWorkflowMetadataRequest("/api/workflows/examples-of-mine", "GET")
    ).toBe(false);
  });

  it("never exempts a mutation", () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      expect(
        isPublicWorkflowMetadataRequest("/api/workflows/public", method)
      ).toBe(false);
    }
  });
});

describe("isPublicAuthExemptRoute", () => {
  it("exempts health, config, metadata, webhooks, and public workflow reads", () => {
    for (const path of [
      "/health",
      "/ready",
      "/api/health",
      "/api/config",
      "/api/assets/packages",
      "/api/assets/packages/nodetool-base/foo.png",
      "/api/nodes/metadata",
      "/api/kie/webhook/callback",
      "/api/webhooks/tok-abc",
      "/api/workflows/public/wf-1"
    ]) {
      expect(isPublicAuthExemptRoute(path, "GET")).toBe(true);
    }
    expect(isPublicAuthExemptRoute("/api/webhooks/tok-abc", "POST")).toBe(true);
  });

  it("exempts the integration routes, which carry their own service token", () => {
    expect(
      isPublicAuthExemptRoute("/api/integrations/telegram/token", "POST")
    ).toBe(true);
    expect(
      isPublicAuthExemptRoute("/api/integrations/telegram/link", "DELETE")
    ).toBe(true);
    // Not a prefix match on the bare word: only the route family is exempt.
    expect(isPublicAuthExemptRoute("/api/integrations", "GET")).toBe(false);
  });

  it("keeps private workflow library paths behind auth", () => {
    expect(isPublicAuthExemptRoute("/api/workflows/wf-123", "GET")).toBe(false);
  });
});

describe("isPublicOAuthRequest", () => {
  it("exempts only the two browser redirect targets", () => {
    expect(isPublicOAuthRequest("/api/oauth/hf/callback")).toBe(true);
    expect(isPublicOAuthRequest("/api/oauth/github/callback")).toBe(true);
  });

  it("keeps credential read/write paths behind auth", () => {
    for (const path of [
      "/api/oauth/hf/start",
      "/api/oauth/hf/tokens",
      "/api/oauth/hf/refresh",
      "/api/oauth/hf/whoami",
      "/api/oauth/github/start",
      "/api/oauth/github/tokens",
      "/api/oauth/github/user",
      "/api/oauth/openai/start",
      "/api/oauth/openai/tokens",
      "/api/oauth/openai/disconnect"
    ]) {
      expect(isPublicOAuthRequest(path)).toBe(false);
    }
  });
});

describe("isPublicAppDeploymentRequest", () => {
  it("exempts reading a deployed app and minting its run session", () => {
    expect(isPublicAppDeploymentRequest("/api/apps/tok3n", "GET")).toBe(true);
    expect(
      isPublicAppDeploymentRequest("/api/apps/tok3n/session", "POST")
    ).toBe(true);
  });

  it("exempts nothing deeper or differently shaped", () => {
    // A token is one path segment; anything below it is a route that does not
    // exist, and exempting it would widen the hole ahead of the code.
    expect(isPublicAppDeploymentRequest("/api/apps/tok3n/runs", "GET")).toBe(
      false
    );
    expect(isPublicAppDeploymentRequest("/api/apps/tok3n/session", "GET")).toBe(
      false
    );
    expect(isPublicAppDeploymentRequest("/api/apps/tok3n", "POST")).toBe(false);
    expect(isPublicAppDeploymentRequest("/api/apps/tok3n", "DELETE")).toBe(
      false
    );
    expect(isPublicAppDeploymentRequest("/api/apps/", "GET")).toBe(false);
    expect(isPublicAppDeploymentRequest("/api/apps", "GET")).toBe(false);
  });

  it("never reaches the owner-scoped application routes", () => {
    for (const path of [
      "/api/applications",
      "/api/applications/app-1",
      "/api/applications/app-1/released-document",
      "/api/apps-private/app-1"
    ]) {
      expect(isPublicAppDeploymentRequest(path, "GET")).toBe(false);
      expect(isPublicAuthExemptRoute(path, "GET")).toBe(false);
      expect(isPublicAuthExemptRoute(path, "POST")).toBe(false);
    }
  });

  it("is reachable through the top-level allowlist", () => {
    expect(isPublicAuthExemptRoute("/api/apps/tok3n", "GET")).toBe(true);
    expect(isPublicAuthExemptRoute("/api/apps/tok3n/session", "POST")).toBe(
      true
    );
  });
});
