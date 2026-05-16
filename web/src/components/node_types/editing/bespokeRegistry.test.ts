import {
  BESPOKE_BODY_REGISTRY,
  getBespokeBody,
  isBespokeNode
} from "./bespokeRegistry";
import BlurBody from "./BlurBody";
import CropBody from "./CropBody";
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
    expect(isBespokeNode(meta("nodetool.control.If"))).toBe(false);
    expect(isBespokeNode(meta("nodetool.image.Channels"))).toBe(false);
    expect(getBespokeBody(meta("nodetool.image.Channels"))).toBeUndefined();
  });

  it("maps nodetool.image.Blur → BlurBody", () => {
    const m = meta("nodetool.image.Blur");
    expect(isBespokeNode(m)).toBe(true);
    expect(getBespokeBody(m)).toBe(BlurBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Blur"]).toBe(BlurBody);
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
