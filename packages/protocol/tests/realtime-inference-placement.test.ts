import { describe, expect, it } from "vitest";
import {
  REALTIME_INFERENCE_PLACEMENTS,
  validateRealtimeInferencePlacement
} from "../src/index.js";

describe("realtime inference placement matrix", () => {
  it("documents the runtime owner and allowed browser engines for operator browsers", () => {
    const operatorBrowser = REALTIME_INFERENCE_PLACEMENTS.operator_browser;

    expect(operatorBrowser.owner).toBe("operator");
    expect(operatorBrowser.allowedEngines).toContain("mediapipe");
    expect(operatorBrowser.allowedBackends).toContain("webgpu");
  });

  it("accepts browser-capable nodes in operator browser placement", () => {
    const result = validateRealtimeInferencePlacement({
      placement: "operator_browser",
      engine: "mediapipe",
      backend: "webgpu",
      profile: {
        browser_capable: true,
        requires_browser_frame: true,
        requires_webgpu: true
      }
    });

    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("rejects non-browser-capable nodes in browser placements", () => {
    const result = validateRealtimeInferencePlacement({
      placement: "electron_renderer",
      engine: "tfjs",
      backend: "webgl",
      profile: {
        browser_capable: false
      }
    });

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain(
      "placement electron_renderer requires realtime_profile.browser_capable"
    );
  });

  it("rejects WebGPU-required nodes when the selected backend is not WebGPU", () => {
    const result = validateRealtimeInferencePlacement({
      placement: "operator_browser",
      engine: "tfjs",
      backend: "wasm",
      profile: {
        browser_capable: true,
        requires_webgpu: true
      }
    });

    expect(result.valid).toBe(false);
    expect(result.reasons).toContain(
      "node requires WebGPU but backend wasm was selected"
    );
  });
});
