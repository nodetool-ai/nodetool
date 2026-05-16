import {
  BESPOKE_BODY_REGISTRY,
  getBespokeBody,
  isBespokeNode
} from "./bespokeRegistry";
import ResizeBody from "./ResizeBody";
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
    expect(isBespokeNode(meta("nodetool.image.Crop"))).toBe(false);
    expect(getBespokeBody(meta("nodetool.image.Crop"))).toBeUndefined();
  });

  it("maps nodetool.image.Resize → ResizeBody", () => {
    const m = meta("nodetool.image.Resize");
    expect(isBespokeNode(m)).toBe(true);
    expect(getBespokeBody(m)).toBe(ResizeBody);
    expect(BESPOKE_BODY_REGISTRY["nodetool.image.Resize"]).toBe(ResizeBody);
  });
});
