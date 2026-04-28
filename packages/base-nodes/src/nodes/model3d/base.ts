import { BaseNode } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { Model3DRefLike } from "./types.js";
import { modelRef, modelRefToBytes } from "./utils.js";

export abstract class GlbTransformNode extends BaseNode {
  declare model: any;

  protected getModel(): Model3DRefLike {
    const v = this.model;
    return v && typeof v === "object" ? (v as Model3DRefLike) : {};
  }

  protected abstract transform(
    bytes: Uint8Array
  ): Uint8Array | null | Promise<Uint8Array | null>;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const model = this.getModel();
    const bytes = await modelRefToBytes(model, context);
    const out = await this.transform(bytes);
    if (!out) return { output: modelRef(bytes, { uri: model.uri ?? "", format: model.format ?? "glb" }) };
    return { output: modelRef(out, { uri: model.uri ?? "", format: "glb" }) };
  }
}

export const glbOutput = (bytes: Uint8Array, uri = ""): Record<string, unknown> => ({
  output: modelRef(bytes, { uri, format: "glb" })
});
