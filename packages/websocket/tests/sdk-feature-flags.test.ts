import { describe, expect, it } from "vitest";
import {
  getSdkFeatureFlagSnapshot,
  isSdkLifecycleV1Enabled,
  isSdkV1AuthenticationEnabled,
  isSdkWorkflowInterfaceV1Enabled
} from "../src/sdk/sdk-feature-flags.js";

describe("SDK feature flags", () => {
  it("enables additive SDK profiles by default while auth remains opt-in", () => {
    expect(getSdkFeatureFlagSnapshot({})).toEqual({
      workflowInterfaceV1: true,
      authenticationV1: false,
      lifecycleV1: true
    });
  });

  it("keeps SDK authentication as an exact server-side opt-in", () => {
    const environment = {
      NODETOOL_REQUIRE_SDK_AUTH_V1: "1"
    };
    expect(isSdkWorkflowInterfaceV1Enabled(environment)).toBe(true);
    expect(isSdkV1AuthenticationEnabled(environment)).toBe(true);
    expect(isSdkLifecycleV1Enabled(environment)).toBe(true);
    expect(getSdkFeatureFlagSnapshot(environment)).toEqual({
      workflowInterfaceV1: true,
      authenticationV1: true,
      lifecycleV1: true
    });
  });

  it.each([undefined, "", "0", "true", "yes", "2"])(
    "ignores non-exact disable value %j",
    (value) => {
      const environment = {
        NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1: value,
        NODETOOL_DISABLE_SDK_LIFECYCLE_V1: value
      };
      expect(getSdkFeatureFlagSnapshot(environment)).toEqual({
        workflowInterfaceV1: true,
        authenticationV1: false,
        lifecycleV1: true
      });
    }
  );

  it("honors exact server-side SDK kill switches", () => {
    const environment = {
      NODETOOL_DISABLE_SDK_WORKFLOW_INTERFACE_V1: "1",
      NODETOOL_DISABLE_SDK_LIFECYCLE_V1: "1"
    };
    expect(isSdkWorkflowInterfaceV1Enabled(environment)).toBe(false);
    expect(isSdkLifecycleV1Enabled(environment)).toBe(false);
    expect(getSdkFeatureFlagSnapshot(environment)).toEqual({
      workflowInterfaceV1: false,
      authenticationV1: false,
      lifecycleV1: false
    });
  });
});
