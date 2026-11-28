import { describe, expect, it } from "vitest";
import { isServerEnvOnlySetting, isSharedServer } from "../host-settings.js";

const OIDC = {
  OIDC_ISSUER: "https://idp.example.com/realms/acme",
  OIDC_CLIENT_ID: "nodetool"
};

describe("isSharedServer", () => {
  it("is false for a local install and a self-hosted full profile", () => {
    expect(isSharedServer({})).toBe(false);
    expect(isSharedServer({ NODETOOL_NODE_PROFILE: "full" })).toBe(false);
  });

  it("is true when auth is enforced or the cloud profile is active", () => {
    expect(isSharedServer(OIDC)).toBe(true);
    expect(isSharedServer({ NODETOOL_NODE_PROFILE: "cloud" })).toBe(true);
    expect(isSharedServer({ NODETOOL_ENV: "production" })).toBe(true);
  });
});

describe("isServerEnvOnlySetting", () => {
  it("covers program paths on a shared server only", () => {
    for (const key of [
      "CLAUDE_CLI_PATH",
      "BLENDER_PATH",
      "MANIMGX_PATH",
      "SD_CPP_SERVER_PATH"
    ]) {
      expect(isServerEnvOnlySetting(key, OIDC)).toBe(true);
      expect(isServerEnvOnlySetting(key, {})).toBe(false);
    }
  });

  it("leaves directories and ordinary settings to the user", () => {
    expect(isServerEnvOnlySetting("PROJECTS_DIR", OIDC)).toBe(false);
    expect(isServerEnvOnlySetting("AUTOSAVE_ENABLED", OIDC)).toBe(false);
    expect(isServerEnvOnlySetting("NOT_A_SETTING", OIDC)).toBe(false);
  });
});
