import { describe, expect, it } from "vitest";
import { isAnalyticsDisabledByEnv } from "../src/core/env.js";

describe("isAnalyticsDisabledByEnv", () => {
  it.each(["0", "false", "off", "no", "disable", "disabled", " OFF ", "False"])(
    "NODETOOL_TELEMETRY=%j disables analytics",
    (value) => {
      expect(isAnalyticsDisabledByEnv({ NODETOOL_TELEMETRY: value })).toBe(true);
    }
  );

  it.each(["1", "true", "yes", " TRUE ", "\t1\n"])(
    "DO_NOT_TRACK=%j disables analytics",
    (value) => {
      expect(isAnalyticsDisabledByEnv({ DO_NOT_TRACK: value })).toBe(true);
    }
  );

  it.each([undefined, "", "1", "true", "on", "yes", "enabled", "2"])(
    "NODETOOL_TELEMETRY=%j alone does not disable analytics",
    (value) => {
      expect(isAnalyticsDisabledByEnv({ NODETOOL_TELEMETRY: value })).toBe(false);
    }
  );

  it.each([undefined, "", "0", "false", "off", "no", "2"])(
    "DO_NOT_TRACK=%j alone does not disable analytics",
    (value) => {
      expect(isAnalyticsDisabledByEnv({ DO_NOT_TRACK: value })).toBe(false);
    }
  );

  it("lets a disabling variable win over an enabling-looking one", () => {
    expect(
      isAnalyticsDisabledByEnv({ NODETOOL_TELEMETRY: "1", DO_NOT_TRACK: "1" })
    ).toBe(true);
    expect(
      isAnalyticsDisabledByEnv({ NODETOOL_TELEMETRY: "off", DO_NOT_TRACK: "0" })
    ).toBe(true);
  });

  it("is false for an empty environment", () => {
    expect(isAnalyticsDisabledByEnv({})).toBe(false);
  });
});
