import { expect, it } from "vitest";
import { CliFeatureNotInstalledError } from "../src/cli-feature.js";

it("names an install command that works in a non-interactive terminal", () => {
  const error = new CliFeatureNotInstalledError("cli-chat");
  expect(error.code).toBe("FEATURE_NOT_INSTALLED");
  expect(error.message).toContain('"nodetool packs add cli-chat --yes"');
});
