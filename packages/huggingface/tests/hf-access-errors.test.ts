import { describe, expect, it } from "vitest";
import {
  augmentHfHubAccessError,
  looksLikeHfHubAccessError
} from "../src/hf-access-errors.js";

describe("looksLikeHfHubAccessError", () => {
  it("detects restricted / paths-info errors", () => {
    expect(
      looksLikeHfHubAccessError(
        "Access to model facebook/sam3 is restricted. Please log in. URL: .../paths-info/main"
      )
    ).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(looksLikeHfHubAccessError("ENOENT: no such file")).toBe(false);
  });
});

describe("augmentHfHubAccessError", () => {
  it("prepends guidance for access errors", () => {
    const raw =
      "Access to model x/y is restricted. You must be authenticated. paths-info";
    const out = augmentHfHubAccessError(raw);
    expect(out).toContain("What to do:");
    expect(out).toContain("HF_TOKEN");
    expect(out).toContain(raw);
  });

  it("passes through other messages", () => {
    const raw = "Disk full";
    expect(augmentHfHubAccessError(raw)).toBe(raw);
  });
});
