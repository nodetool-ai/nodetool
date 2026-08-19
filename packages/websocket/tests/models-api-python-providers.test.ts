import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRegisteredProvider,
  unregisterProvider
} from "@nodetool-ai/runtime";
import { registerPythonProviders } from "../src/models-api.js";

describe("registerPythonProviders", () => {
  afterEach(() => {
    unregisterProvider("huggingface-local");
  });

  it("registers local Hugging Face beside the hosted provider", async () => {
    const bridge = {
      listProviders: vi.fn().mockResolvedValue([
        {
          id: "huggingface",
          capabilities: ["text_to_speech"],
          required_secrets: []
        }
      ])
    };

    await expect(registerPythonProviders(bridge as any)).resolves.toEqual([
      "huggingface-local"
    ]);
    expect(getRegisteredProvider("huggingface")).not.toBeNull();
    expect(getRegisteredProvider("huggingface-local")?.kwargs).toMatchObject({
      _id: "huggingface-local",
      _bridgeProviderId: "huggingface",
      _bridge: bridge
    });
  });
});
