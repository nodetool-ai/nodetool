import type { ActiveLayer, AnimatedLayerProps } from "@nodetool-ai/timeline/render";
import { stub } from "../../../../test-utils/doubles";
import { rasterWindowMargin } from "../compositeLayers";

const layer = (members: Partial<ActiveLayer> = {}): ActiveLayer => stub<ActiveLayer>({ ...members });
const anim = (members: Partial<AnimatedLayerProps> = {}): AnimatedLayerProps =>
  stub<AnimatedLayerProps>({ opacity: 1, ...members });

describe("rasterWindowMargin", () => {
  it("windows a plain layer with no margin", () => {
    expect(rasterWindowMargin(layer(), anim())).toBe(0);
  });

  it("reserves the margin an animated blur needs over the clip's own effects", () => {
    expect(
      rasterWindowMargin(
        layer({ effects: [] }),
        anim({ effects: [{ id: "b", type: "blur", enabled: true, radius: 5 }] })
      )
    ).toBe(15);
  });

  it.each<[string, Partial<ActiveLayer>, Partial<AnimatedLayerProps>]>([
    ["a crop", { crop: { left: 0.1, right: 0, top: 0, bottom: 0 } }, {}],
    ["a border radius", {}, { borderRadius: 12 }],
    ["an enabled track effect", { trackEffects: [{ id: "t", type: "vignette", enabled: true }] } as Partial<ActiveLayer>, {}],
    ["a frame-placed effect", {}, { effects: [{ id: "v", type: "vignette", enabled: true }] } as Partial<AnimatedLayerProps>]
  ])("keeps the frame-sized raster for %s", (_name, layerMembers, animMembers) => {
    expect(rasterWindowMargin(layer(layerMembers), anim(animMembers))).toBeUndefined();
  });
});
