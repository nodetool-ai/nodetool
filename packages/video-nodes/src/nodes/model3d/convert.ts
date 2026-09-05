import { prop } from "@nodetool-ai/node-sdk";

import { GlbTransformNode } from "./base.js";
import type { Model3DRefLike } from "./types.js";
import { DEFAULT_MODEL_3D } from "./defaults.js";
import { convertGlbToGltf } from "./document-ops.js";
import { modelBytes, modelFormat, modelRef, replaceExtension } from "./utils.js";

/** Output handles FormatConverterNode.process() emits. */
type FormatConverterNodeOutputs = {
  output: { type: string; asset_id: null; metadata: null; data: string };
};

export class FormatConverterNode extends GlbTransformNode {
  static readonly nodeType = "nodetool.model3d.FormatConverter";
  static readonly title = "Format Converter";
  static readonly description =
    "Convert a 3D model between supported formats.\n    3d, mesh, model, convert, format, glb, gltf, export\n\n    Currently supported conversions: glb → gltf. Other targets are not yet implemented.\n\n    Use cases:\n    - Convert GLB to textual glTF for inspection\n    - Export models as glTF for tool compatibility";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["model"];

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to convert"
  })
  declare model: Model3DRefLike;

  @prop({
    type: "enum",
    default: "glb",
    title: "Output Format",
    description: "Target format for conversion. Currently only glb → gltf is supported.",
    values: ["glb", "gltf"]
  })
  declare output_format: "glb" | "gltf";

  protected transform(_bytes: Uint8Array): Uint8Array | null {
    return null;
  }

  async process(): Promise<FormatConverterNodeOutputs> {
    const model = this.getModel();
    const bytes = modelBytes(model);
    const inputFormat = modelFormat(model);
    const outputFormat = this.output_format.toLowerCase();

    if (outputFormat === inputFormat) {
      return {
        output: modelRef(bytes, {
          uri: replaceExtension(model.uri ?? "", outputFormat),
          format: outputFormat
        })
      };
    }

    if (inputFormat !== "glb" || outputFormat !== "gltf") {
      throw new Error(
        `Unsupported model conversion: ${inputFormat} → ${outputFormat}. Only glb → gltf is currently supported.`
      );
    }

    const convertedBytes = await convertGlbToGltf(bytes);
    return {
      output: modelRef(convertedBytes, {
        uri: replaceExtension(model.uri ?? "", outputFormat),
        format: outputFormat
      })
    };
  }
}
