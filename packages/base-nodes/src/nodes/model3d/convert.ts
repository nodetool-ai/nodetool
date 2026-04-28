import { prop } from "@nodetool/node-sdk";

import { GlbTransformNode } from "./base.js";
import { DEFAULT_MODEL_3D } from "./defaults.js";
import { convertGlbToGltf } from "./document-ops.js";
import { modelBytes, modelFormat, modelRef, replaceExtension } from "./utils.js";

export class FormatConverterNode extends GlbTransformNode {
  static readonly nodeType = "nodetool.model3d.FormatConverter";
  static readonly title = "Format Converter";
  static readonly description =
    "Convert a 3D model between supported formats.\n    3d, mesh, model, convert, format, glb, gltf, export\n\n    Currently supported conversions: glb → gltf. Other targets are not yet implemented.\n\n    Use cases:\n    - Convert GLB to textual glTF for inspection\n    - Export models as glTF for tool compatibility";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to convert"
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "glb",
    title: "Output Format",
    description: "Target format for conversion. Currently only glb → gltf is supported.",
    values: ["glb", "gltf"]
  })
  declare output_format: any;

  protected transform(_bytes: Uint8Array): Uint8Array | null {
    return null;
  }

  async process(): Promise<Record<string, unknown>> {
    const model = this.getModel();
    const bytes = modelBytes(model);
    const inputFormat = modelFormat(model);
    const outputFormat = String(this.output_format ?? "glb").toLowerCase();

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
