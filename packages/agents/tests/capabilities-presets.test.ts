import { expect, it } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
const context = {} as unknown as ProcessingContext;
it("discovers, reads and compiles presets through registered tools", async () => {
  const list = await toolForCapabilityName("list_presets").process(context, {
    kind: "camera",
    mode: "video",
    family: "kling"
  });
  expect(Array.isArray(list)).toBe(true);
  expect(list).toContainEqual(
    expect.objectContaining({ id: "camera.bullet-time" })
  );
  expect(
    await toolForCapabilityName("get_preset").process(context, {
      id: "camera.bullet-time"
    })
  ).toMatchObject({ id: "camera.bullet-time" });
  expect(
    await toolForCapabilityName("compile_presets").process(context, {
      preset_ids: ["camera.bullet-time"],
      model: "fal-ai/kling-video/v3/pro/text-to-video",
      mode: "video"
    })
  ).toMatchObject({ applied: ["camera.bullet-time"] });
  expect(
    await toolForCapabilityName("get_preset").process(context, {
      id: "missing"
    })
  ).toEqual({ error: "Unknown preset: missing" });
});
