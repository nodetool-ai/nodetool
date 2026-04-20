import { BaseNode } from "@nodetool/node-sdk";
import type { Model3DRefLike } from "./types.js";
import { modelBytes, modelRef, passthroughModel } from "./utils.js";

export abstract class GlbTransformNode extends BaseNode {
  declare model: any;

  protected getModel(): Model3DRefLike {
    const v = this.model;
    return v && typeof v === "object" ? (v as Model3DRefLike) : {};
  }

  protected abstract transform(
    bytes: Uint8Array
  ): Uint8Array | null | Promise<Uint8Array | null>;

  async process(): Promise<Record<string, unknown>> {
    const model = this.getModel();
    const bytes = modelBytes(model);
    const out = await this.transform(bytes);
    if (!out) return passthroughModel(model);
    return { output: modelRef(out, { uri: model.uri ?? "", format: "glb" }) };
  }
}

export const glbOutput = (bytes: Uint8Array, uri = ""): Record<string, unknown> => ({
  output: modelRef(bytes, { uri, format: "glb" })
});
