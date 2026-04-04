import { describe, it, expect } from "vitest";
import { extractModels, type ExtractedModel } from "../src/sync.js";

describe("extractModels()", () => {
  describe("empty and missing data", () => {
    it("should return empty array for empty object", () => {
      expect(extractModels({})).toEqual([]);
    });

    it("should return empty array when graph is undefined", () => {
      expect(extractModels({ graph: undefined })).toEqual([]);
    });

    it("should return empty array when graph has no nodes", () => {
      expect(extractModels({ graph: {} })).toEqual([]);
    });

    it("should return empty array when nodes is empty array", () => {
      expect(extractModels({ graph: { nodes: [] } })).toEqual([]);
    });

    it("should return empty array when nodes have no data", () => {
      expect(extractModels({ graph: { nodes: [{}] } })).toEqual([]);
    });

    it("should return empty array when nodes have no model field", () => {
      expect(
        extractModels({ graph: { nodes: [{ data: { foo: "bar" } }] } })
      ).toEqual([]);
    });
  });

  describe("HuggingFace models", () => {
    it("should extract a basic HF model", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "hf.diffusers",
                  repo_id: "stabilityai/stable-diffusion-xl-base-1.0"
                }
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("hf.diffusers");
      expect(result[0].repo_id).toBe(
        "stabilityai/stable-diffusion-xl-base-1.0"
      );
    });

    it("should extract HF model with path and variant", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "hf.model",
                  repo_id: "org/model",
                  path: "model.safetensors",
                  variant: "fp16"
                }
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe("model.safetensors");
      expect(result[0].variant).toBe("fp16");
    });

    it("should extract HF model with allow and ignore patterns", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "hf.checkpoint",
                  repo_id: "org/model",
                  allow_patterns: ["*.safetensors"],
                  ignore_patterns: ["*.bin"]
                }
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(1);
      expect(result[0].allow_patterns).toEqual(["*.safetensors"]);
      expect(result[0].ignore_patterns).toEqual(["*.bin"]);
    });

    it("should set null for missing path/variant/patterns", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "hf.model",
                  repo_id: "org/model"
                }
              }
            }
          ]
        }
      });
      expect(result[0].path).toBeNull();
      expect(result[0].variant).toBeNull();
      expect(result[0].allow_patterns).toBeNull();
      expect(result[0].ignore_patterns).toBeNull();
    });

    it("should skip HF model without repo_id", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "hf.model"
                }
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(0);
    });

    it("should skip HF model with empty repo_id", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "hf.model",
                  repo_id: ""
                }
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(0);
    });

    it("should deduplicate identical HF models", () => {
      const node = {
        data: {
          model: {
            type: "hf.model",
            repo_id: "org/model"
          }
        }
      };
      const result = extractModels({
        graph: { nodes: [node, node, node] }
      });
      expect(result).toHaveLength(1);
    });

    it("should not deduplicate HF models with different paths", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: { type: "hf.model", repo_id: "org/model", path: "a.bin" }
              }
            },
            {
              data: {
                model: { type: "hf.model", repo_id: "org/model", path: "b.bin" }
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(2);
    });

    it("should extract multiple different HF models", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: { type: "hf.diffusers", repo_id: "org/model-a" }
              }
            },
            {
              data: {
                model: { type: "hf.checkpoint", repo_id: "org/model-b" }
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(2);
    });
  });

  describe("Ollama models", () => {
    it("should extract an Ollama model from model field", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "language_model",
                  provider: "ollama",
                  id: "llama3:8b"
                }
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("language_model");
      expect(result[0].provider).toBe("ollama");
      expect(result[0].id).toBe("llama3:8b");
    });

    it("should extract Ollama model from root-level node data", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                type: "language_model",
                provider: "ollama",
                id: "mistral:latest"
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("mistral:latest");
    });

    it("should skip Ollama model without id", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "language_model",
                  provider: "ollama"
                }
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(0);
    });

    it("should deduplicate identical Ollama models", () => {
      const node = {
        data: {
          model: {
            type: "language_model",
            provider: "ollama",
            id: "llama3:8b"
          }
        }
      };
      const result = extractModels({
        graph: { nodes: [node, node] }
      });
      expect(result).toHaveLength(1);
    });

    it("should deduplicate Ollama model from both model field and root level", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "language_model",
                  provider: "ollama",
                  id: "llama3:8b"
                },
                type: "language_model",
                provider: "ollama",
                id: "llama3:8b"
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(1);
    });
  });

  describe("llama_cpp models", () => {
    it("should extract a llama_cpp model as HF GGUF", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "language_model",
                  provider: "llama_cpp",
                  id: "TheBloke/Llama-2-7B-GGUF:llama-2-7b.Q4_K_M.gguf"
                }
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("hf.gguf");
      expect(result[0].repo_id).toBe("TheBloke/Llama-2-7B-GGUF");
      expect(result[0].path).toBe("llama-2-7b.Q4_K_M.gguf");
    });

    it("should set null for variant and patterns on llama_cpp models", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "language_model",
                  provider: "llama_cpp",
                  id: "org/model:file.gguf"
                }
              }
            }
          ]
        }
      });
      expect(result[0].variant).toBeNull();
      expect(result[0].allow_patterns).toBeNull();
      expect(result[0].ignore_patterns).toBeNull();
    });

    it("should skip llama_cpp model without colon in id", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "language_model",
                  provider: "llama_cpp",
                  id: "some-model-no-colon"
                }
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(0);
    });

    it("should skip llama_cpp model without id", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: {
                  type: "language_model",
                  provider: "llama_cpp"
                }
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(0);
    });

    it("should deduplicate identical llama_cpp models", () => {
      const node = {
        data: {
          model: {
            type: "language_model",
            provider: "llama_cpp",
            id: "org/model:file.gguf"
          }
        }
      };
      const result = extractModels({
        graph: { nodes: [node, node] }
      });
      expect(result).toHaveLength(1);
    });
  });

  describe("nested models (e.g., loras in arrays)", () => {
    it("should extract HF models from arrays in node data", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                loras: [
                  {
                    type: "hf.lora",
                    repo_id: "org/lora-model-a"
                  },
                  {
                    type: "hf.lora",
                    repo_id: "org/lora-model-b"
                  }
                ]
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(2);
      expect(result[0].repo_id).toBe("org/lora-model-a");
      expect(result[1].repo_id).toBe("org/lora-model-b");
    });

    it("should deduplicate nested array models", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                loras: [
                  { type: "hf.lora", repo_id: "org/lora" },
                  { type: "hf.lora", repo_id: "org/lora" }
                ]
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(1);
    });

    it("should skip non-HF items in arrays", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                items: [
                  { type: "other", repo_id: "org/x" },
                  "a string",
                  42,
                  null
                ]
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(0);
    });

    it("should skip arrays with null items", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                items: [null, undefined]
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(0);
    });
  });

  describe("mixed model types", () => {
    it("should extract HF, Ollama, and llama_cpp models from one graph", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: { type: "hf.diffusers", repo_id: "org/diffusion-model" }
              }
            },
            {
              data: {
                model: {
                  type: "language_model",
                  provider: "ollama",
                  id: "llama3:8b"
                }
              }
            },
            {
              data: {
                model: {
                  type: "language_model",
                  provider: "llama_cpp",
                  id: "org/gguf:model.gguf"
                }
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(3);
      expect(result.map((m) => m.type)).toEqual([
        "hf.diffusers",
        "language_model",
        "hf.gguf"
      ]);
    });

    it("should ignore non-model data fields", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: { type: "hf.model", repo_id: "org/m" },
                prompt: "hello",
                steps: 20,
                enabled: true
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(1);
    });
  });

  describe("edge cases", () => {
    it("should ignore model field that is an array", () => {
      const result = extractModels({
        graph: {
          nodes: [{ data: { model: ["not", "an", "object"] } }]
        }
      });
      expect(result).toHaveLength(0);
    });

    it("should ignore model field that is a string", () => {
      const result = extractModels({
        graph: {
          nodes: [{ data: { model: "just-a-string" } }]
        }
      });
      expect(result).toHaveLength(0);
    });

    it("should ignore model field that is a number", () => {
      const result = extractModels({
        graph: {
          nodes: [{ data: { model: 42 } }]
        }
      });
      expect(result).toHaveLength(0);
    });

    it("should handle model with non-hf non-ollama type gracefully", () => {
      const result = extractModels({
        graph: {
          nodes: [
            {
              data: {
                model: { type: "openai", id: "gpt-4" }
              }
            }
          ]
        }
      });
      expect(result).toHaveLength(0);
    });
  });
});
