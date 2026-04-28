import { describe, it, expect, vi } from "vitest";
import type { NodeDescriptor } from "@nodetool-ai/protocol";
import type { PythonStdioBridge } from "../src/index.js";
import { PythonNodeExecutor } from "../src/python-node-executor.js";

describe("executor resolver with PythonStdioBridge", () => {
  it("returns PythonNodeExecutor for Python node types", () => {
    const bridge = {
      hasNodeType: vi.fn((t: string) => t === "huggingface.TextToImage"),
      getNodeMetadata: vi.fn().mockReturnValue([
        {
          node_type: "huggingface.TextToImage",
          outputs: [{ name: "output", type: { type: "ImageRef" } }],
          required_settings: ["HF_TOKEN"]
        }
      ])
    } as unknown as PythonStdioBridge;

    const tsResolve = vi.fn();

    const resolve = (node: NodeDescriptor) => {
      if (bridge.hasNodeType(node.type)) {
        const meta = bridge
          .getNodeMetadata()
          .find((n) => n.node_type === node.type);
        return new PythonNodeExecutor(
          bridge,
          node.type,
          (node.properties as Record<string, unknown>) ?? {},
          Object.fromEntries(
            (meta?.outputs ?? []).map((o) => [o.name, o.type.type])
          ),
          meta?.required_settings ?? []
        );
      }
      return tsResolve(node);
    };

    const descriptor: NodeDescriptor = {
      id: "n1",
      type: "huggingface.TextToImage",
      name: "TextToImage"
    };

    const executor = resolve(descriptor);
    expect(executor).toBeInstanceOf(PythonNodeExecutor);
    expect(tsResolve).not.toHaveBeenCalled();
  });

  it("falls through to TS resolve for non-Python nodes", () => {
    const bridge = {
      hasNodeType: vi.fn().mockReturnValue(false)
    } as unknown as PythonStdioBridge;

    const mockExecutor = { process: vi.fn() };
    const tsResolve = vi.fn().mockReturnValue(mockExecutor);

    const resolve = (node: NodeDescriptor) => {
      if (bridge.hasNodeType(node.type)) {
        throw new Error("should not reach here");
      }
      return tsResolve(node);
    };

    const descriptor: NodeDescriptor = {
      id: "n2",
      type: "nodetool.text.Concat",
      name: "Concat"
    };

    const executor = resolve(descriptor);
    expect(executor).toBe(mockExecutor);
    expect(tsResolve).toHaveBeenCalled();
  });
});
