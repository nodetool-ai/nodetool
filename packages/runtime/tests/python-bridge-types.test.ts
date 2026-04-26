import { describe, expect, it } from "vitest";
import type { PythonNodeMetadata } from "../src/python-bridge-types.js";

describe("PythonNodeMetadata realtime profile parity", () => {
  it("accepts the shared realtime_profile emitted by Python node metadata", () => {
    const metadata: PythonNodeMetadata = {
      node_type: "nodetool.realtime.browser.HandLandmarks",
      title: "Hand Landmarks",
      description: "Browser-local hand landmark detector",
      properties: [],
      outputs: [],
      required_settings: [],
      is_realtime_capable: true,
      realtime_profile: {
        browser_capable: true,
        requires_browser_frame: true,
        requires_webgpu: false,
        emits_analysis_event: true,
        emits_parameter_update: false,
        emits_media_frame: false
      }
    };

    expect(metadata.realtime_profile?.browser_capable).toBe(true);
  });
});
