import { describe, expect, it } from "vitest";
import {
  isCloudProfileEnv,
  isUserCredentialKey,
  mayUseServerCredential,
  registerUserCredentialKey,
  withheldServerCredentials
} from "../server-credentials.js";

const CLOUD = { NODETOOL_NODE_PROFILE: "cloud" };
const PRODUCTION = { NODETOOL_ENV: "production" };
const SELF_HOSTED = { NODETOOL_ENV: "production", NODETOOL_NODE_PROFILE: "full" };
const DESKTOP = {};

registerUserCredentialKey("TEST_PROVIDER_API_KEY");

describe("isCloudProfileEnv", () => {
  it("follows an explicit profile first, then production mode", () => {
    expect(isCloudProfileEnv(CLOUD)).toBe(true);
    expect(isCloudProfileEnv(PRODUCTION)).toBe(true);
    expect(isCloudProfileEnv(SELF_HOSTED)).toBe(false);
    expect(isCloudProfileEnv(DESKTOP)).toBe(false);
    expect(isCloudProfileEnv({ NODETOOL_NODE_PROFILE: "  " })).toBe(false);
  });
});

describe("mayUseServerCredential", () => {
  it("withholds a registered provider credential on the cloud profile", () => {
    expect(isUserCredentialKey("TEST_PROVIDER_API_KEY")).toBe(true);
    expect(mayUseServerCredential("TEST_PROVIDER_API_KEY", CLOUD)).toBe(false);
    expect(mayUseServerCredential("TEST_PROVIDER_API_KEY", PRODUCTION)).toBe(false);
  });

  it("allows it on a desktop or self-hosted server", () => {
    expect(mayUseServerCredential("TEST_PROVIDER_API_KEY", DESKTOP)).toBe(true);
    expect(mayUseServerCredential("TEST_PROVIDER_API_KEY", SELF_HOSTED)).toBe(true);
  });

  it("allows keys nothing registered, such as platform keys", () => {
    expect(mayUseServerCredential("NODETOOL_PLATFORM_OPENROUTER_KEY", CLOUD)).toBe(true);
    expect(mayUseServerCredential("SUPABASE_URL", CLOUD)).toBe(true);
  });
});

describe("withheldServerCredentials", () => {
  it("names registered credentials set in a cloud environment", () => {
    expect(
      withheldServerCredentials({ ...CLOUD, TEST_PROVIDER_API_KEY: "sk-test", OTHER: "x" })
    ).toEqual(["TEST_PROVIDER_API_KEY"]);
  });

  it("is empty off the cloud profile and for empty values", () => {
    expect(withheldServerCredentials({ TEST_PROVIDER_API_KEY: "sk-test" })).toEqual([]);
    expect(withheldServerCredentials({ ...CLOUD, TEST_PROVIDER_API_KEY: "" })).toEqual([]);
  });
});
