import { describe, it, expect } from "vitest";
import {
  createProviderRegistrar,
  runNeedsPythonBridge,
  type PythonBridgeGateState
} from "../src/python-bridge-gate.js";

const asrNode = {
  id: "asr",
  type: "nodetool.text.AutomaticSpeechRecognition",
  data: {
    model: {
      type: "asr_model",
      id: "openai/whisper-small",
      provider: "huggingface-local"
    }
  }
};

const state = (
  overrides: Partial<PythonBridgeGateState> = {}
): PythonBridgeGateState => ({
  bridgeReady: false,
  bridgeAvailable: true,
  isPythonNodeType: () => false,
  providerIds: () => ["huggingface", "openai"],
  ...overrides
});

describe("runNeedsPythonBridge", () => {
  it("waits for the worker when a node selects a provider it registers", () => {
    expect(runNeedsPythonBridge([asrNode], state())).toBe(true);
  });

  it("waits even when the bridge is connected but providers are not registered", () => {
    expect(runNeedsPythonBridge([asrNode], state({ bridgeReady: true }))).toBe(
      true
    );
  });

  it("starts at once when the provider is already registered", () => {
    expect(
      runNeedsPythonBridge(
        [asrNode],
        state({ providerIds: () => ["huggingface-local", "openai"] })
      )
    ).toBe(false);
  });

  it("leaves an unknown provider to the preflight when no worker exists", () => {
    expect(
      runNeedsPythonBridge([asrNode], state({ bridgeAvailable: false }))
    ).toBe(false);
  });

  it("waits for the worker before a Python node runs", () => {
    expect(
      runNeedsPythonBridge(
        [{ id: "p", type: "huggingface.Whisper", data: {} }],
        state({ isPythonNodeType: (type) => type === "huggingface.Whisper" })
      )
    ).toBe(true);
  });
});

describe("createProviderRegistrar", () => {
  it("shares one registration across callers that arrive while it runs", async () => {
    let calls = 0;
    let finish: (ids: string[]) => void = () => undefined;
    const register = createProviderRegistrar(() => {
      calls += 1;
      return new Promise<string[]>((resolve) => {
        finish = resolve;
      });
    });

    const first = register();
    const second = register();
    finish(["huggingface-local"]);

    expect(await first).toEqual(["huggingface-local"]);
    expect(await second).toEqual(["huggingface-local"]);
    expect(calls).toBe(1);
  });

  it("registers again after a failure", async () => {
    let calls = 0;
    const register = createProviderRegistrar(async () => {
      calls += 1;
      if (calls === 1) throw new Error("worker not ready");
      return ["huggingface-local"];
    });

    await expect(register()).rejects.toThrow("worker not ready");
    expect(await register()).toEqual(["huggingface-local"]);
  });
});
