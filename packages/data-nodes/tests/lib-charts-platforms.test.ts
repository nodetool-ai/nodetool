import { describe, expect, it } from "vitest";
import { supportsPlatform } from "@nodetool-ai/protocol";

import { ChartRendererLibNode } from "@nodetool-ai/data-nodes";

describe("lib.charts platform tags", () => {
  it("ChartRenderer (native @napi-rs/canvas) does not support workers/edge", () => {
    expect(supportsPlatform(ChartRendererLibNode.platforms, "node")).toBe(true);
    expect(supportsPlatform(ChartRendererLibNode.platforms, "workers")).toBe(
      false
    );
    expect(supportsPlatform(ChartRendererLibNode.platforms, "edge")).toBe(
      false
    );
  });
});
