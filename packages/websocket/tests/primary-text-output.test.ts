import { describe, it, expect } from "vitest";
import { primaryTextOutputName } from "../src/unified-websocket-runner.js";

describe("primaryTextOutputName", () => {
  it("returns the first output name when its type is str", () => {
    expect(
      primaryTextOutputName({
        outputs: [
          { name: "text", type: { type: "str" } },
          { name: "audio", type: { type: "audio" } }
        ]
      })
    ).toBe("text");
  });

  it("honors primary_output when set to a str output", () => {
    expect(
      primaryTextOutputName({
        primary_output: "summary",
        outputs: [
          { name: "raw", type: { type: "image" } },
          { name: "summary", type: { type: "str" } }
        ]
      })
    ).toBe("summary");
  });

  it("returns undefined when the primary output is not text", () => {
    expect(
      primaryTextOutputName({
        outputs: [{ name: "image", type: { type: "image" } }]
      })
    ).toBeUndefined();
  });

  it("returns undefined for missing/empty metadata", () => {
    expect(primaryTextOutputName(undefined)).toBeUndefined();
    expect(primaryTextOutputName({ outputs: [] })).toBeUndefined();
  });
});
