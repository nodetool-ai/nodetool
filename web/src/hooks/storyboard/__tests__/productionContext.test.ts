import {
  deterministicFingerprint,
  readProductionRequirements
} from "../productionContext";

describe("readProductionRequirements", () => {
  it("preserves speech, duration, and reference inputs used by fingerprints", () => {
    const production = readProductionRequirements({
      speech_mode: "on_camera",
      speech_binding: {
        script_line_id: "line-1",
        text: "The camera follows the product."
      },
      duration_ms: 4200,
      speech_duration_ms: 3600,
      references: [
        {
          uri: "asset://product-1.png",
          name: "Product pack shot",
          revision: "asset-rev-2"
        }
      ]
    });

    expect(production).toMatchObject({
      speech_binding: {
        script_line_id: "line-1",
        text: "The camera follows the product."
      },
      duration_ms: 4200,
      speech_duration_ms: 3600,
      references: [
        {
          uri: "asset://product-1.png",
          revision: "asset-rev-2"
        }
      ]
    });
    expect(deterministicFingerprint(production)).not.toBe(
      deterministicFingerprint({ ...production, duration_ms: 4000 })
    );
  });
});
