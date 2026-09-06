/**
 * Publish-result classification for `node scripts/publish-packages.mjs`.
 *
 * The whole point of the script is that a release can be re-run after a partial
 * failure. That only holds if "this version is already on the registry" is read
 * as success and a genuine error is not — misreading either direction is silent:
 * one aborts a recoverable release, the other reports a broken release as green.
 */
import { describe, expect, it } from "vitest";

import { classifyPublishResult } from "../publish-packages.mjs";

/** The 404 that killed every release from 0.7.0-rc.38 onward. */
const UNAUTHORIZED_404 = [
  "npm error code E404",
  "npm error 404 Not Found - PUT https://registry.npmjs.org/@nodetool-ai%2fprotocol - Not found",
  "npm error 404  '@nodetool-ai/protocol@0.7.0-rc.40' is not in this registry.",
].join("\n");

describe("classifyPublishResult", () => {
  it("counts a clean exit as published", () => {
    expect(classifyPublishResult(0, "+ @nodetool-ai/cli@0.7.0-rc.40")).toBe(
      "published"
    );
  });

  it("counts an already-published version as skipped, not failed", () => {
    const output =
      "npm error code EPUBLISHCONFLICT\n" +
      "npm error You cannot publish over the previously published versions: 0.7.0-rc.40.";
    expect(classifyPublishResult(1, output)).toBe("skipped");
  });

  it("counts the unauthorized 404 as a real failure", () => {
    expect(classifyPublishResult(1, UNAUTHORIZED_404)).toBe("failed");
  });

  it("counts an arbitrary non-zero exit as a real failure", () => {
    expect(classifyPublishResult(1, "npm error code ENEEDAUTH")).toBe("failed");
  });

  it("does not mistake a 404 mentioning a version for a conflict", () => {
    // Guards the substring match: "cannot publish over" must not be inferred
    // from unrelated text that merely names a version.
    expect(classifyPublishResult(1, "npm error 404 version 1.2.3 not found")).toBe(
      "failed"
    );
  });
});
