import {
  BESPOKE_BODY_REGISTRY,
  getBespokeBody,
  isBespokeNode
} from "./bespokeRegistry";
import BlurBody from "./BlurBody";
import ChannelsBody from "./ChannelsBody";
import CompositorBody from "./CompositorBody";
import CropBody from "./CropBody";
import LevelsBody from "./LevelsBody";
import MasksExtractorBody from "./MasksExtractorBody";
import ResizeBody from "./ResizeBody";
import RotateAndFlipBody from "./RotateAndFlipBody";
import type { NodeMetadata } from "../../../stores/ApiTypes";

const meta = (node_type: string): NodeMetadata =>
  ({ node_type, outputs: [] }) as unknown as NodeMetadata;

describe("bespokeRegistry", () => {
  it("returns false / undefined for undefined metadata", () => {
    expect(isBespokeNode(undefined)).toBe(false);
    expect(getBespokeBody(undefined)).toBeUndefined();
  });

  it("does not match utility / generic nodes", () => {
    expect(isBespokeNode(meta("nodetool.image.Painter"))).toBe(false);
    expect(getBespokeBody(meta("nodetool.image.Painter"))).toBeUndefined();
  });

  it("maps nodetool.image.Blur → BlurBody", () => {
    const m = meta("nodetool.image.Blur");
    expect(isBespokeNode(m)).toBe(true);
    expect(getBespokeBody(m)).toBe(BlurBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Blur"]).toBe(BlurBody);
  });

  it("maps nodetool.image.Channels → ChannelsBody", () => {
    const m = meta("nodetool.image.Channels");
    expect(isBespokeNode(m)).toBe(true);
    expect(getBespokeBody(m)).toBe(ChannelsBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Channels"]).toBe(ChannelsBody);
  });

  it("maps mask-extractor node types → MasksExtractorBody", () => {
    const types = [
      "replicate.image.background.Bria_RemoveBackground",
      "replicate.image.background.BackgroundRemover_851",
      "replicate.image.background.BackgroundRemover_Codeplug",
      "replicate.image.process.RemoveBackground"
    ];
    for (const t of types) {
      const m = meta(t);
      expect(isBespokeNode(m)).toBe(true);
      expect(getBespokeBody(m)).toBe(MasksExtractorBody);
      expect(BESPOKE_BODY_REGISTRY[t]).toBe(MasksExtractorBody);
    }
  });

  it("maps nodetool.image.Levels → LevelsBody", () => {
    const m = meta("nodetool.image.Levels");
    expect(isBespokeNode(m)).toBe(true);
    expect(getBespokeBody(m)).toBe(LevelsBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Levels"]).toBe(LevelsBody);
  });

  it("maps nodetool.image.Compositor → CompositorBody", () => {
    const m = meta("nodetool.image.Compositor");
    expect(isBespokeNode(m)).toBe(true);
    expect(getBespokeBody(m)).toBe(CompositorBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Compositor"]).toBe(
      CompositorBody
    );
  });

  it("maps nodetool.image.Crop → CropBody", () => {
    const m = meta("nodetool.image.Crop");
    expect(isBespokeNode(m)).toBe(true);
    expect(getBespokeBody(m)).toBe(CropBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Crop"]).toBe(CropBody);
  });

  it("maps nodetool.image.Resize → ResizeBody", () => {
    const m = meta("nodetool.image.Resize");
    expect(isBespokeNode(m)).toBe(true);
    expect(getBespokeBody(m)).toBe(ResizeBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Resize"]).toBe(ResizeBody);
  });

  it("maps nodetool.image.RotateAndFlip → RotateAndFlipBody", () => {
    const m = meta("nodetool.image.RotateAndFlip");
    expect(isBespokeNode(m)).toBe(true);
    expect(getBespokeBody(m)).toBe(RotateAndFlipBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.RotateAndFlip"]).toBe(
      RotateAndFlipBody
    );
  });
});
