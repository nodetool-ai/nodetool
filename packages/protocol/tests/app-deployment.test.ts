import { describe, it, expect } from "vitest";

import {
  APP_DEPLOYMENT_PATH_PREFIX,
  APP_DEPLOYMENT_SESSION_TTL_SECONDS,
  appDeploymentPath,
  isAppDeploymentEnabled
} from "../src/app-deployment.js";

describe("isAppDeploymentEnabled", () => {
  it("is on in production", () => {
    expect(isAppDeploymentEnabled("production")).toBe(true);
  });

  it("is off everywhere else", () => {
    for (const value of [
      undefined,
      null,
      "",
      "development",
      "test",
      "staging",
      "Production",
      "production "
    ]) {
      expect(isAppDeploymentEnabled(value)).toBe(false);
    }
  });
});

describe("appDeploymentPath", () => {
  it("puts the token on the public client route", () => {
    expect(appDeploymentPath("abc123")).toBe("/a/abc123");
  });
});

describe("constants", () => {
  it("keeps the API prefix and the client route distinct", () => {
    expect(APP_DEPLOYMENT_PATH_PREFIX).toBe("/api/apps/");
    expect(appDeploymentPath("t").startsWith(APP_DEPLOYMENT_PATH_PREFIX)).toBe(
      false
    );
  });

  it("expires a session within the hour", () => {
    expect(APP_DEPLOYMENT_SESSION_TTL_SECONDS).toBe(3600);
  });
});
