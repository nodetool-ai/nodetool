import {
  getRealtimeNodeBadges,
  validateRealtimeNodePlacement
} from "../realtimeBrowserAffordances";
import type { NodeMetadata } from "../../stores/ApiTypes";

const browserNode: NodeMetadata = {
  title: "Hand Landmarks",
  description: "Browser hand landmarks",
  namespace: "nodetool.realtime.browser",
  node_type: "nodetool.realtime.browser.HandLandmarks",
  layout: "default",
  properties: [],
  outputs: [],
  recommended_models: [],
  basic_fields: [],
  required_settings: [],
  is_dynamic: false,
  is_streaming_output: false,
  expose_as_tool: false,
  supports_dynamic_outputs: false,
  is_realtime_capable: true,
  realtime_profile: {
    browser_capable: true,
    requires_browser_frame: true,
    requires_webgpu: true,
    emits_analysis_event: true,
    emits_parameter_update: false,
    emits_media_frame: false
  }
};

describe("realtime browser affordances", () => {
  it("returns operator-facing badges for browser-local realtime nodes", () => {
    expect(getRealtimeNodeBadges(browserNode).map((badge) => badge.label)).toEqual([
      "Browser local",
      "Camera frame",
      "WebGPU",
      "Analysis event"
    ]);
  });

  it("validates selected runtime placement against realtime metadata", () => {
    const result = validateRealtimeNodePlacement(browserNode, {
      placement: "operator_browser",
      engine: "mediapipe",
      backend: "wasm"
    });

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain(
      "node requires WebGPU but backend wasm was selected"
    );
  });
});
