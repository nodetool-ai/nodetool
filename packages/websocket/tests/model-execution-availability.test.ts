import { describe, expect, it } from "vitest";
import type { UnifiedModel } from "@nodetool-ai/protocol";
import {
  resolveModelExecutionAvailability,
  type ProviderExecutionInfo
} from "../src/model-execution-availability.js";

const providers = new Map<string, ProviderExecutionInfo>([
  [
    "huggingface-local",
    {
      access: "in_process",
      displayName: "Hugging Face Local",
      configured: true
    }
  ],
  [
    "replicate",
    { access: "remote_api", displayName: "Replicate", configured: true }
  ],
  [
    "ollama",
    { access: "local_service", displayName: "Ollama", configured: true }
  ]
]);

function model(overrides: Partial<UnifiedModel>): UnifiedModel {
  return { id: "model", name: "Model", ...overrides };
}

describe("resolveModelExecutionAvailability", () => {
  it("does not treat downloaded TTS files as a runnable local model", () => {
    const [resolved] = resolveModelExecutionAvailability(
      [
        model({
          id: "ResembleAI/chatterbox",
          repo_id: "ResembleAI/chatterbox",
          type: null,
          downloaded: true
        })
      ],
      providers
    );

    expect(resolved.execution).toMatchObject({
      kind: "unavailable",
      state: "unavailable",
      label: "Unavailable"
    });
    expect(resolved.execution?.reason).toContain("no execution adapter");
  });

  it("joins an installed adapter to its exact cached repository", () => {
    const target = model({
      id: "Supertone/supertonic-3",
      type: "tts_model",
      provider: "huggingface-local",
      adapter: {
        state: "installed",
        artifact_ref: {
          source: "huggingface",
          repo_id: "Supertone/supertonic-3"
        }
      }
    });
    const cache = model({
      id: "Supertone/supertonic-3",
      repo_id: "Supertone/supertonic-3",
      type: null,
      downloaded: true
    });

    const [resolvedTarget, resolvedCache] = resolveModelExecutionAvailability(
      [target, cache],
      providers
    );

    expect(resolvedTarget.execution).toMatchObject({
      kind: "server",
      state: "ready",
      label: "Server",
      execution_site: "nodetool_host"
    });
    expect(resolvedCache.execution).toEqual(resolvedTarget.execution);
  });

  it("keeps a cached model unavailable when its adapter dependency is missing", () => {
    const [resolved] = resolveModelExecutionAvailability(
      [
        model({
          id: "SWivid/F5-TTS",
          type: "tts_model",
          provider: "huggingface-local",
          downloaded: true,
          adapter: {
            state: "missing_dependency",
            reason: "Install f5-tts.",
            artifact_ref: {
              source: "huggingface",
              repo_id: "SWivid/F5-TTS"
            }
          }
        })
      ],
      providers
    );

    expect(resolved.execution).toEqual({
      kind: "unavailable",
      state: "unavailable",
      label: "Unavailable",
      reason: "Install f5-tts."
    });
  });

  it("labels configured remote APIs and local services independently", () => {
    const [api, server] = resolveModelExecutionAvailability(
      [
        model({ id: "tts-api", type: "tts_model", provider: "replicate" }),
        model({ id: "llama3", type: "language_model", provider: "ollama" })
      ],
      providers
    );

    expect(api.execution).toMatchObject({ kind: "api", state: "ready" });
    expect(api.execution?.reason).toContain("Provider billing applies");
    expect(api.execution?.execution_site).toBe("provider");
    expect(server.execution).toMatchObject({
      kind: "server",
      state: "ready",
      execution_site: "nodetool_host",
      runtime_name: "Ollama"
    });
  });
});
