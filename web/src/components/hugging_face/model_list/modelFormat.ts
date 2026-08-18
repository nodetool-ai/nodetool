import type { UnifiedModel } from "../../../stores/ApiTypes";

/**
 * Weight-format classification for the model manager's format filter.
 *
 * The list has no explicit format field, so the format is read from what the
 * model does carry: its runtime type (`llama_model` runs GGUF, `tjs.*` runs
 * ONNX), Hub tags, file extensions in `path`/`cache_path`, and format markers
 * in the repo id or name (e.g. `mlx-community/...`, `...-GGUF`).
 */

export interface ModelFormat {
  id: string;
  label: string;
}

export const MODEL_FORMATS: readonly ModelFormat[] = [
  { id: "gguf", label: "GGUF" },
  { id: "onnx", label: "ONNX" },
  { id: "safetensors", label: "Safetensors" },
  { id: "pytorch", label: "PyTorch" },
  { id: "tensorrt", label: "TensorRT" },
  { id: "mlx", label: "MLX" }
];

const EXTENSION_FORMATS: Record<string, string> = {
  gguf: "gguf",
  onnx: "onnx",
  safetensors: "safetensors",
  pt: "pytorch",
  pth: "pytorch",
  bin: "pytorch"
};

/** Format markers matched as whole words in the repo id / name / path. */
const NAME_MARKERS: Record<string, RegExp> = {
  gguf: /(^|[^a-z0-9])gguf([^a-z0-9]|$)/,
  onnx: /(^|[^a-z0-9])onnx([^a-z0-9]|$)/,
  mlx: /(^|[^a-z0-9])mlx([^a-z0-9]|$)/,
  tensorrt: /(^|[^a-z0-9])(tensorrt|trt)([^a-z0-9]|$)/
};

/** Which weight formats a model carries, by id from `MODEL_FORMATS`. */
export const formatsForModel = (model: UnifiedModel): Set<string> => {
  const result = new Set<string>();

  const type = model.type ?? "";
  if (type === "llama_model") {
    result.add("gguf");
  }
  // transformers.js runs ONNX exports.
  if (type.startsWith("tjs")) {
    result.add("onnx");
  }

  for (const tag of model.tags ?? []) {
    const normalized = tag.toLowerCase();
    if (MODEL_FORMATS.some((f) => f.id === normalized)) {
      result.add(normalized);
    }
  }

  for (const path of [model.path, model.cache_path]) {
    const ext = path?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    const format = ext ? EXTENSION_FORMATS[ext] : undefined;
    if (format) {
      result.add(format);
    }
  }

  const haystack = [model.repo_id, model.name, model.id, model.path]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  for (const [format, marker] of Object.entries(NAME_MARKERS)) {
    if (marker.test(haystack)) {
      result.add(format);
    }
  }

  return result;
};
