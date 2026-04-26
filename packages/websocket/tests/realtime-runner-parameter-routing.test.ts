import { describe, expect, it, vi } from "vitest";
import { routeRealtimeParameterUpdates } from "../src/realtime/runner-parameter-routing.js";

describe("routeRealtimeParameterUpdates", () => {
  it("routes parameters through realtime controls before falling back to inputs", async () => {
    const pushParameter = vi
      .fn()
      .mockResolvedValueOnce({ routed: true, nodeIds: ["param-1"] })
      .mockResolvedValueOnce({ routed: false, nodeIds: [] });
    const pushInputValue = vi.fn().mockResolvedValue(undefined);

    const result = await routeRealtimeParameterUpdates({
      activeJob: {
        runner: {
          pushParameter,
          pushInputValue
        }
      },
      jobId: "job-1",
      parameterUpdates: {
        prompt: "cat",
        fallback: 0.5
      },
      sessionId: "session-1"
    });

    expect(pushParameter).toHaveBeenNthCalledWith(1, "prompt", "cat");
    expect(pushParameter).toHaveBeenNthCalledWith(2, "fallback", 0.5);
    expect(pushInputValue).toHaveBeenCalledWith("fallback", 0.5);
    expect(result).toEqual({
      routedParameters: ["prompt", "fallback"],
      unroutedParameters: []
    });
  });
});
