import { BaseNode } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { Model3DRefLike } from "./types.js";
import { modelRef, modelRefToBytes } from "./utils.js";
import { isObjectLike } from "@nodetool-ai/node-sdk";

/** Output handles GlbTransformNode.process() emits. */
type GlbTransformNodeOutputs = {
  output: { type: string; asset_id: null; metadata: null; data: string };
};

export abstract class GlbTransformNode extends BaseNode {
  declare model: Model3DRefLike;

  protected getModel(): Model3DRefLike {
    return isObjectLike(this.model) ? this.model : {};
  }

  protected abstract transform(
    bytes: Uint8Array
  ): Uint8Array | null | Promise<Uint8Array | null>;

  async process(context?: ProcessingContext): Promise<GlbTransformNodeOutputs> {
    const model = this.getModel();
    const bytes = await modelRefToBytes(model, context);
    const out = await this.transform(bytes);
    if (!out) return { output: modelRef(bytes, { uri: model.uri ?? "", format: model.format ?? "glb" }) };
    return { output: modelRef(out, { uri: model.uri ?? "", format: "glb" }) };
  }
}

export const glbOutput = (bytes: Uint8Array, uri = "") => ({
  output: modelRef(bytes, { uri, format: "glb" })
});
