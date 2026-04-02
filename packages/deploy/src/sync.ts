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

/**
 * Extract both HuggingFace and Ollama models from a workflow graph.
 *
 * Scans through all nodes in the workflow graph to find models that need to be
 * pre-downloaded. This includes:
 * - HuggingFace models (type starts with "hf.")
 * - Ollama language models (type="language_model" and provider="ollama")
 * - llama_cpp language models (type="language_model" and provider="llama_cpp")
 */
export function extractModels(workflowData: WorkflowData): ExtractedModel[] {
  const models: ExtractedModel[] = [];
  const seenModels = new Set<string>();

  const nodes = workflowData.graph?.nodes;
  if (!nodes) {
    return models;
  }

  for (const node of nodes) {
    if (!node.data) {
      continue;
    }

    const nodeData = node.data;

    // Check for model field containing HuggingFace or Ollama models
    const model = nodeData["model"];
    if (model && typeof model === "object" && !Array.isArray(model)) {
      const m = model as Record<string, unknown>;

      // HuggingFace models
      if (
        typeof m["type"] === "string" &&
        m["type"].startsWith("hf.") &&
        typeof m["repo_id"] === "string" &&
        m["repo_id"]
      ) {
        const modelKey = `hf|${m["type"]}|${m["repo_id"]}|${m["path"] ?? ""}|${m["variant"] ?? ""}`;

        if (!seenModels.has(modelKey)) {
          seenModels.add(modelKey);
          models.push({
            type: (m["type"] as string) || "hf.model",
            repo_id: m["repo_id"] as string,
            path: (m["path"] as string | null) ?? null,
            variant: (m["variant"] as string | null) ?? null,
            allow_patterns: (m["allow_patterns"] as string[] | null) ?? null,
            ignore_patterns: (m["ignore_patterns"] as string[] | null) ?? null
          });
        }
      }
      // Ollama language models
      else if (
        m["type"] === "language_model" &&
        m["provider"] === "ollama" &&
        m["id"]
      ) {
        const modelKey = `ollama|${m["id"]}`;

        if (!seenModels.has(modelKey)) {
          seenModels.add(modelKey);
          models.push({
            type: "language_model",
            provider: "ollama",
            id: m["id"] as string
          });
        }
      }
      // llama_cpp language models (HuggingFace GGUF models)
      else if (
        m["type"] === "language_model" &&
        m["provider"] === "llama_cpp" &&
        typeof m["id"] === "string"
      ) {
        const modelId = m["id"] as string;
        if (modelId.includes(":")) {
          const [repoId, filePath] = modelId.split(":", 2);
          const modelKey = `hf|hf.gguf|${repoId}|${filePath}|`;

          if (!seenModels.has(modelKey)) {
            seenModels.add(modelKey);
            models.push({
              type: "hf.gguf",
              repo_id: repoId,
              path: filePath,
              variant: null,
              allow_patterns: null,
              ignore_patterns: null
            });
          }
        }
      }
    }

    // Check for language models at the root level
    if (
      nodeData["type"] === "language_model" &&
      nodeData["provider"] === "ollama" &&
      nodeData["id"]
    ) {
      const modelKey = `ollama|${nodeData["id"]}`;

      if (!seenModels.has(modelKey)) {
        seenModels.add(modelKey);
        models.push({
          type: "language_model",
          provider: "ollama",
          id: nodeData["id"] as string
        });
      }
    }

    // Check for nested model references (e.g., in arrays like loras)
    for (const [, value] of Object.entries(nodeData)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object" && !Array.isArray(item)) {
            const it = item as Record<string, unknown>;
            if (
              typeof it["type"] === "string" &&
              it["type"].startsWith("hf.") &&
              typeof it["repo_id"] === "string" &&
              it["repo_id"]
            ) {
              const modelKey = `hf|${it["type"]}|${it["repo_id"]}|${it["path"] ?? ""}|${it["variant"] ?? ""}`;

              if (!seenModels.has(modelKey)) {
                seenModels.add(modelKey);
                models.push({
                  type: (it["type"] as string) || "hf.model",
                  repo_id: it["repo_id"] as string,
                  path: (it["path"] as string | null) ?? null,
                  variant: (it["variant"] as string | null) ?? null,
                  allow_patterns:
                    (it["allow_patterns"] as string[] | null) ?? null,
                  ignore_patterns:
                    (it["ignore_patterns"] as string[] | null) ?? null
                });
              }
            }
          }
        }
      }
    }
  }

  return models;
}
