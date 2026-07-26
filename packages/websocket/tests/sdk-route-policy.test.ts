import { describe, expect, it } from "vitest";
import {
  isSdkV1AuthenticationRequired,
  isSdkV1DiscoveryRequest
} from "../src/sdk/sdk-route-policy.js";

describe("SDK v1 route policy", () => {
  it.each([
    ["GET", "/api/sdk/v1/workflows"],
    ["GET", "/api/sdk/v1/capabilities"],
    ["POST", "/api/sdk/v1/workflow-interfaces"],
    ["GET", "/api/sdk/v1/node-types"],
    ["GET", "/api/workflows/workflow-1/interface"]
  ])("recognizes %s %s as SDK discovery", (method, pathname) => {
    expect(isSdkV1DiscoveryRequest(pathname, method)).toBe(true);
  });

  it.each([
    ["POST", "/api/sdk/v1/workflows"],
    ["POST", "/api/sdk/v1/preflight"],
    ["GET", "/api/sdk/v1/workflow-interfaces"],
    ["GET", "/api/workflows/workflow-1"],
    ["GET", "/api/nodes/metadata"]
  ])("does not broaden SDK discovery to %s %s", (method, pathname) => {
    expect(isSdkV1DiscoveryRequest(pathname, method)).toBe(false);
  });

  it("requires exact opt-in and otherwise preserves current behavior", () => {
    expect(isSdkV1AuthenticationRequired({})).toBe(false);
    expect(
      isSdkV1AuthenticationRequired({
        NODETOOL_REQUIRE_SDK_AUTH_V1: "0"
      })
    ).toBe(false);
    expect(
      isSdkV1AuthenticationRequired({
        NODETOOL_REQUIRE_SDK_AUTH_V1: "1"
      })
    ).toBe(true);
  });

  it("never bypasses authentication on an authenticated server", () => {
    expect(isSdkV1AuthenticationRequired({}, true)).toBe(true);
    expect(
      isSdkV1AuthenticationRequired(
        { NODETOOL_REQUIRE_SDK_AUTH_V1: "0" },
        true
      )
    ).toBe(true);
  });
});
