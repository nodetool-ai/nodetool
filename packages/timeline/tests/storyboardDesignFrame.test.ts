import { describe, expect, it } from "vitest";
import type { Shot } from "@nodetool-ai/protocol";
import { buildStoryboardDesignFrame } from "../src/storyboardDesignFrame.js";
import { materializeStoryboard } from "../src/finish-storyboard.js";

const shot = (): Shot => ({
  type: "shot",
  id: "hook",
  index: 0,
  status: "planned",
  action: "Offer",
  duration_seconds: 4,
  production: {
    media_strategy: "still_motion_graphics",
    protected_inputs: [
      {
        id: "product",
        kind: "product",
        asset_id: "original-product",
        allowed_transformations: ["position", "scale", "opacity"]
      },
      {
        id: "logo",
        kind: "logo",
        asset_id: "original-logo",
        allowed_transformations: ["position", "scale", "opacity"]
      },
      {
        id: "price",
        kind: "exact_text",
        value: " €29 ",
        allowed_transformations: ["position", "opacity"]
      }
    ]
  },
  graphics: {
    mode: "graphics_first",
    elements: [
      {
        id: "product",
        kind: "asset",
        role: "product",
        protected_input_id: "product"
      },
      { id: "logo", kind: "asset", role: "logo", protected_input_id: "logo" },
      {
        id: "price",
        kind: "text",
        role: "price",
        protected_input_id: "price",
        text: " €29 "
      }
    ]
  }
});
const input = () => ({
  boardId: "board",
  shots: [shot()],
  width: 1080,
  height: 1920
});
const layers = (value: ReturnType<typeof materializeStoryboard>["document"]) =>
  value.clips.map(
    ({
      id,
      trackId,
      storyboardMaterializationBaseline,
      animations,
      ...clip
    }) => ({
      ...clip,
      animations: animations?.map(({ id, ...animation }) => animation)
    })
  );
describe("Storyboard design frame", () => {
  it("uses the finishing composition with exact separately editable product, logo and copy", () => {
    const args = input();
    const before = structuredClone(args);
    const preview = buildStoryboardDesignFrame(args, "hook");
    expect(preview.validation).toEqual([]);
    expect(layers(preview.document)).toEqual(
      layers(materializeStoryboard(args).document)
    );
    expect(preview.document.clips.map((clip) => clip.currentAssetId)).toEqual([
      "original-product",
      "original-logo",
      undefined
    ]);
    expect(preview.document.clips[2].textStyle?.text).toBe(" €29 ");
    expect(preview.timeMs).toBe(2000);
    expect(args).toEqual(before);
  });
  it("does not become stale merely because composition UUIDs are fresh", () => {
    expect(buildStoryboardDesignFrame(input(), "hook").fingerprint).toBe(
      buildStoryboardDesignFrame(input(), "hook").fingerprint
    );
  });
  it.each(["copy", "asset", "direction", "policy", "size", "motion", "still"])(
    "invalidates changed %s input",
    (change) => {
      const args = input();
      const previous = buildStoryboardDesignFrame(args, "hook").fingerprint;
      if (change === "copy")
        args.shots[0].graphics!.elements![2].text = " €19 ";
      if (change === "asset")
        args.shots[0].production!.protected_inputs[0].asset_id = "new-product";
      if (change === "direction")
        args.shots[0].graphics!.direction = "quiet premium composition";
      if (change === "policy")
        args.shots[0].production!.media_strategy = "hybrid";
      if (change === "size") args.width = 1920;
      if (change === "motion") args.shots[0].motion = "Slow entrance";
      if (change === "still")
        args.shots[0].keyframe = { type: "image", asset_id: "new-background" };
      expect(buildStoryboardDesignFrame(args, "hook").fingerprint).not.toBe(
        previous
      );
    }
  );
  it("invalidates board style, motion and entity reference changes", () => {
    const args = input();
    const entity = {
      type: "entity" as const,
      id: "brand",
      kind: "prop" as const,
      name: "Logo",
      descriptor: "Exact logo",
      reference_images: [{ type: "image" as const, asset_id: "original-logo" }]
    };
    const previous = buildStoryboardDesignFrame(args, "hook", {
      style: "warm",
      entities: [entity]
    }).fingerprint;
    expect(
      buildStoryboardDesignFrame(args, "hook", {
        style: "cool",
        entities: [entity]
      }).fingerprint
    ).not.toBe(previous);
    expect(
      buildStoryboardDesignFrame(args, "hook", {
        style: "warm",
        entities: [
          {
            ...entity,
            reference_images: [{ type: "image", asset_id: "replacement-logo" }]
          }
        ]
      }).fingerprint
    ).not.toBe(previous);
    expect(
      buildStoryboardDesignFrame(
        { ...args, motionDesign: { direction: "flow" } },
        "hook"
      ).fingerprint
    ).not.toBe(buildStoryboardDesignFrame(args, "hook").fingerprint);
  });
  it("reports invalid semantic references without mutating the inputs", () => {
    const args = {
      ...input(),
      motionDesign: {
        transitions: [{ from_shot_id: "hook", to_shot_id: "missing" }]
      }
    };
    const before = structuredClone(args);
    expect(
      buildStoryboardDesignFrame(args, "hook").validation.some((issue) =>
        issue.message.includes("missing shot")
      )
    ).toBe(true);
    expect(args).toEqual(before);
  });
  it("rejects missing target and reports unfinishable protected sources", () => {
    expect(() => buildStoryboardDesignFrame(input(), "missing")).toThrow(
      "not in this Storyboard"
    );
    const args = input();
    args.shots[0].graphics!.elements = [];
    expect(
      buildStoryboardDesignFrame(args, "hook").validation.some(
        (issue) => issue.code === "missing_element"
      )
    ).toBe(true);
  });
});
