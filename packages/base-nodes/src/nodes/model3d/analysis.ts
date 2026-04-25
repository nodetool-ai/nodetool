import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";

import { DEFAULT_MODEL_3D } from "./defaults.js";
import { analyzeGlbMetadata, fallbackMetadata, parseGlb } from "./glb.js";
import type { Model3DRefLike } from "./types.js";
import { modelFormat, modelRefToBytes } from "./utils.js";

export class GetModel3DMetadataNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.GetModel3DMetadata";
  static readonly title = "Get Model 3D Metadata";
  static readonly description =
    "Get metadata about a 3D model.\n    3d, mesh, model, metadata, info, properties\n\n    Use cases:\n    - Get vertex and face counts for processing decisions\n    - Analyze model properties\n    - Gather information for model cataloging";
  // Returns { output: <metadata dict> } — use output: "dict" to match the actual return shape.
  static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to analyze"
  })
  declare model: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const model = (this.model ?? {}) as Model3DRefLike;
    const bytes = await modelRefToBytes(model, context);
    const metadata =
      modelFormat(model) === "glb" && parseGlb(bytes)
        ? analyzeGlbMetadata(model, bytes)
        : fallbackMetadata(model, bytes);
    return { output: metadata };
  }
}
