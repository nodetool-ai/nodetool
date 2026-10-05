import { expect, it } from "vitest";
import { timelineOpFromToolArgs } from "../src/ops/index.js";

it("preserves strict contract finalizers at the engine boundary", () => {
  expect(() =>
    timelineOpFromToolArgs("retarget_format", {
      aspect_ratio: "9:16",
      strategy: "center",
      bogus: true
    })
  ).toThrow(/bogus/);
});

it("keeps a partial style patch and gives explicit fields precedence over wrappers", () => {
  expect(
    timelineOpFromToolArgs("set_clip_params", {
      target: "Title",
      params: { opacity: 0.25, textStyle: { color: "#ffffff" } },
      opacity: 0.5
    })
  ).toMatchObject({
    op: "set_clip_params",
    target: "Title",
    patch: { opacity: 0.5, textStyle: { color: "#ffffff" } }
  });
});
