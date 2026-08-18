/**
 * Workflow model extraction utilities.
 *
 * Extracts HuggingFace and Ollama model references from workflow graphs
 * so they can be pre-downloaded before execution.
 */

/** A model reference extracted from a workflow graph. */
export interface ExtractedModel {
  type: string;
  repo_id?: string;
  path?: string | null;
  variant?: string | null;
  allow_patterns?: string[] | null;
  ignore_patterns?: string[] | null;
  provider?: string;
  id?: string;
}

interface WorkflowNode {
  data?: Record<string, unknown>;
  type?: string;
}

interface WorkflowData {
  graph?: {
    nodes?: WorkflowNode[];
  };
}

/** `value` as a model reference. An array is not one — its items may be. */
function asReference(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** The download a `hf.*` reference names. */
function huggingFaceModel(ref: Record<string, unknown>): ExtractedModel | null {
  const type = ref["type"];
  const repoId = ref["repo_id"];
  if (!isNonEmptyString(type) || !type.startsWith("hf.")) return null;
  if (!isNonEmptyString(repoId)) return null;
  return {
    type,
    repo_id: repoId,
    path: (ref["path"] as string | null) ?? null,
    variant: (ref["variant"] as string | null) ?? null,
    allow_patterns: (ref["allow_patterns"] as string[] | null) ?? null,
    ignore_patterns: (ref["ignore_patterns"] as string[] | null) ?? null
  };
}

/** The pull an Ollama `language_model` reference names. */
function ollamaModel(ref: Record<string, unknown>): ExtractedModel | null {
  if (ref["type"] !== "language_model" || ref["provider"] !== "ollama") {
    return null;
  }
  if (!ref["id"]) return null;
  return {
    type: "language_model",
    provider: "ollama",
    id: ref["id"] as string
  };
}

/**
 * The GGUF download a llama_cpp reference names. Its id is `repo_id:file`, so
 * an id with no colon names no file and there is nothing to fetch.
 */
function llamaCppModel(ref: Record<string, unknown>): ExtractedModel | null {
  if (ref["type"] !== "language_model" || ref["provider"] !== "llama_cpp") {
    return null;
  }
  const id = ref["id"];
  if (typeof id !== "string" || !id.includes(":")) return null;
  const [repoId, filePath] = id.split(":", 2);
  return {
    type: "hf.gguf",
    repo_id: repoId,
    path: filePath,
    variant: null,
    allow_patterns: null,
    ignore_patterns: null
  };
}

/** The download a node's `model` property names, or null when it names none. */
function referencedModel(ref: Record<string, unknown>): ExtractedModel | null {
  return huggingFaceModel(ref) ?? ollamaModel(ref) ?? llamaCppModel(ref);
}

/**
 * Identity of a download: two references with the same key fetch the same
 * bytes. A llama_cpp reference has already resolved to an `hf.gguf` model here,
 * so it keys into the HuggingFace namespace and dedupes against an equal one.
 */
function downloadKey(model: ExtractedModel): string {
  return model.provider === "ollama"
    ? `ollama|${model.id}`
    : `hf|${model.type}|${model.repo_id}|${model.path ?? ""}|${model.variant ?? ""}`;
}

/**
 * Every model a workflow graph needs pre-downloaded, deduplicated, in the order
 * the nodes name them.
 */
export function extractModels(workflowData: WorkflowData): ExtractedModel[] {
  const models: ExtractedModel[] = [];
  const seen = new Set<string>();
  const collect = (model: ExtractedModel | null): void => {
    if (!model) return;
    const key = downloadKey(model);
    if (seen.has(key)) return;
    seen.add(key);
    models.push(model);
  };

  for (const node of workflowData.graph?.nodes ?? []) {
    const nodeData = node.data;
    if (!nodeData) continue;

    const model = asReference(nodeData["model"]);
    if (model) collect(referencedModel(model));

    // A node can carry the reference at its root instead of under `model`.
    // Ollama only: a root-level llama_cpp reference is not extracted.
    collect(ollamaModel(nodeData));

    // Nested references — a `loras` array, say. HuggingFace only: an array is
    // not scanned for a language model.
    for (const value of Object.values(nodeData)) {
      if (!Array.isArray(value)) continue;
      for (const item of value) {
        const nested = asReference(item);
        if (nested) collect(huggingFaceModel(nested));
      }
    }
  }

  return models;
}
