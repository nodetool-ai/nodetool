/**
 * Browser-side execution façade.
 *
 * Proves that `createBrowserRegistry` scopes a registry to the `"browser"`
 * platform and that `runBrowserWorkflow` executes a real browser node end to
 * end while emitting a `ProcessingMessage` stream stamped with job/workflow ids
 * — the contract a Web client relies on to route browser-produced messages
 * through the same pipeline it uses for server messages.
 *
 * The real browser node set (`ALL_BROWSER_NODES`) is used so the test exercises
 * the production path, not a hand-rolled fixture. Node classes come from the
 * compiled `base-nodes` dist (a devDependency), so this file needs no decorator
 * transpilation of its own.
 */

import { describe, it, expect } from "vitest";
import { BaseNode } from "@nodetool-ai/node-sdk";
import type { Platform, ProcessingMessage } from "@nodetool-ai/protocol";
import { ALL_BROWSER_NODES } from "@nodetool-ai/base-nodes/platforms/browser";
import {
  createBrowserRegistry,
  graphRunsInRegistry,
  runBrowserWorkflow
} from "../src/browser.js";

class GreetingNode extends BaseNode {
  static readonly nodeType = "browsertest.Greeting";
  static readonly platforms: readonly Platform[] = ["browser"];
  async process(): Promise<Record<string, unknown>> {
    return { output: "hi" };
  }
}

class ServerOnlyNode extends BaseNode {
  static readonly nodeType = "browsertest.ServerOnly";
  static readonly platforms: readonly Platform[] = ["node"];
  async process(): Promise<Record<string, unknown>> {
    return { output: 1 };
  }
}

describe("createBrowserRegistry", () => {
  it("keeps browser-capable classes and drops the rest", () => {
    const registry = createBrowserRegistry([GreetingNode, ServerOnlyNode]);
    expect(registry.has("browsertest.Greeting")).toBe(true);
    expect(registry.has("browsertest.ServerOnly")).toBe(false);
  });

  it("registers the curated browser node set (e.g. constant.String)", () => {
    const registry = createBrowserRegistry(ALL_BROWSER_NODES);
    expect(registry.has("nodetool.constant.String")).toBe(true);
  });
});

describe("graphRunsInRegistry", () => {
  const registry = createBrowserRegistry([GreetingNode, ServerOnlyNode]);

  it("is true when every node type is registered", () => {
    expect(
      graphRunsInRegistry(
        { nodes: [{ id: "a", type: "browsertest.Greeting" }], edges: [] },
        registry
      )
    ).toBe(true);
  });

  it("is false when any node type is missing", () => {
    expect(
      graphRunsInRegistry(
        {
          nodes: [
            { id: "a", type: "browsertest.Greeting" },
            { id: "b", type: "browsertest.ServerOnly" }
          ],
          edges: []
        },
        registry
      )
    ).toBe(false);
  });

  it("is false for an empty graph", () => {
    expect(graphRunsInRegistry({ nodes: [], edges: [] }, registry)).toBe(false);
  });
});

describe("runBrowserWorkflow", () => {
  it("executes a real browser node and stamps every message", async () => {
    const registry = createBrowserRegistry(ALL_BROWSER_NODES);

    const gen = runBrowserWorkflow({
      graph: {
        nodes: [
          {
            id: "s",
            type: "nodetool.constant.String",
            name: "text",
            properties: { value: "hello browser" }
          }
        ],
        edges: []
      },
      registry,
      workflowId: "wf-1",
      jobId: "job-1"
    });

    const seen: ProcessingMessage[] = [];
    let result;
    while (true) {
      const next = await gen.next();
      if (next.done) {
        result = next.value;
        break;
      }
      seen.push(next.value);
    }

    expect(result.status).toBe("completed");
    expect(result.outputs.text).toEqual(["hello browser"]);

    // The message stream is what a client routes through the same handler it
    // uses for server messages — so every frame must carry both ids.
    expect(seen.length).toBeGreaterThan(0);
    for (const message of seen) {
      const record = message as Record<string, unknown>;
      expect(record.job_id).toBe("job-1");
      expect(record.workflow_id).toBe("wf-1");
    }
    expect(seen.some((m) => m.type === "job_update")).toBe(true);
    // The returned RunResult's messages are stamped too.
    for (const message of result.messages) {
      const record = message as unknown as Record<string, unknown>;
      expect(record.job_id).toBe("job-1");
    }
  });

  it("fails fast when a node is not browser-capable", async () => {
    // Bypass the convenience filter to register a server-only node, so the
    // platform pre-flight (not "unknown node type") is what rejects it.
    const registry = createBrowserRegistry(
      [GreetingNode, ServerOnlyNode],
      "node"
    );

    const gen = runBrowserWorkflow({
      graph: {
        nodes: [{ id: "x", type: "browsertest.ServerOnly" }],
        edges: []
      },
      registry,
      workflowId: "wf-2"
    });

    let result;
    while (true) {
      const next = await gen.next();
      if (next.done) {
        result = next.value;
        break;
      }
    }
    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/browser/);
  });
});
