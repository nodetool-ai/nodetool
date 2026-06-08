import { describe, expect, it } from "vitest";
import type {
  ProviderInstance,
  ProvisionResult,
  WorkerProvider,
  WorkerSpec,
  WorkerStatus,
} from "../providers/types.js";

// A trivial in-test fake provider that both documents and pins the interface.
class FakeProvider implements WorkerProvider {
  async provision(spec: WorkerSpec): Promise<ProvisionResult> {
    return {
      providerRef: `ref-${spec.name}`,
      wsUrl: "wss://example.invalid/ws",
      token: spec.token,
      status: "running",
    };
  }

  async status(_ref: string): Promise<WorkerStatus> {
    return "running";
  }

  async stop(_ref: string): Promise<void> {
    // no-op
  }

  async list(): Promise<ProviderInstance[]> {
    return [{ providerRef: "ref-a", status: "running" }];
  }
}

describe("WorkerProvider types", () => {
  it("round-trips a ProvisionResult from a fake provider", async () => {
    const provider: WorkerProvider = new FakeProvider();
    const spec: WorkerSpec = {
      name: "hf-a40",
      image: "ghcr.io/nodetool-ai/worker:0.7.3",
      target: "runpod",
      gpu: "A40",
      vcpu: 4,
      env: { NODETOOL_LOG_LEVEL: "info" },
      token: "secret-token",
    };

    const result = await provider.provision(spec);

    expect(result).toEqual({
      providerRef: "ref-hf-a40",
      wsUrl: "wss://example.invalid/ws",
      token: "secret-token",
      status: "running",
    });
  });

  it("exposes status, stop, and list on the interface", async () => {
    const provider: WorkerProvider = new FakeProvider();

    await expect(provider.status("ref-a")).resolves.toBe("running");
    await expect(provider.stop("ref-a")).resolves.toBeUndefined();

    const instances = await provider.list();
    expect(instances).toEqual<ProviderInstance[]>([
      { providerRef: "ref-a", status: "running" },
    ]);
  });

  it("accepts a minimal WorkerSpec without optional fields", async () => {
    const provider: WorkerProvider = new FakeProvider();
    const spec: WorkerSpec = {
      name: "minimal",
      image: "ghcr.io/nodetool-ai/worker:latest",
      target: "vast",
    };

    const result = await provider.provision(spec);

    expect(result.providerRef).toBe("ref-minimal");
    expect(result.token).toBeUndefined();
    expect(result.status).toBe("running");
  });

  it("pins the WorkerStatus union to the documented states", () => {
    const states: WorkerStatus[] = [
      "provisioning",
      "running",
      "attached",
      "stopping",
      "stopped",
      "error",
    ];

    expect(states).toHaveLength(6);
  });
});
