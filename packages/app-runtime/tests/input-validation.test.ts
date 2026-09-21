import { describe, expect, it } from "vitest";

import { isMissingRequiredMediaValue } from "../src/input-validation.js";

describe("required media admission", () => {
  it("rejects empty required media values", () => {
    expect(
      isMissingRequiredMediaValue("nodetool.input.ImageInput", undefined)
    ).toBe(true);
    expect(
      isMissingRequiredMediaValue("nodetool.input.VideoListInput", [])
    ).toBe(true);
  });

  it("accepts media references and leaves non-media inputs alone", () => {
    expect(
      isMissingRequiredMediaValue("nodetool.input.ImageInput", {
        asset_id: "asset-1"
      })
    ).toBe(false);
    expect(
      isMissingRequiredMediaValue("nodetool.input.StringInput", undefined)
    ).toBe(false);
  });
});
