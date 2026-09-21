/**
 * Executes the curated getting-started workflow and asserts its user-visible
 * output. Structural validation alone can accept a graph that never produces
 * a useful result, so this test keeps the certified first task on the same
 * path as a real offline workflow run.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NodeRegistry,
  createGraphNodeTypeResolver
} from "@nodetool-ai/node-sdk";
import { ExecutionSession } from "@nodetool-ai/execution";
import { createFakeContext } from "@nodetool-ai/runtime";
import { registerBaseNodes } from "../src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.resolve(
  __dirname,
  "../nodetool/examples/nodetool-base"
);

const CERTIFIED_STARTER = "A Gradient Card as PNG.json";

interface StarterWorkflow {
  graph: {
    nodes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  };
}

describe("certified starter workflows", () => {
  it(
    "executes the gradient card starter and asserts the generated PNG",
    async () => {
      const filePath = path.join(EXAMPLES_DIR, CERTIFIED_STARTER);
      const workflow = JSON.parse(
        fs.readFileSync(filePath, "utf8")
      ) as StarterWorkflow;
      const registry = new NodeRegistry();
      registerBaseNodes(registry);
      const fake = createFakeContext({
        jobId: "certified-starter-gradient",
        persistOutputAssets: false
      });

      try {
        const resolver = createGraphNodeTypeResolver(registry);
        const session = await ExecutionSession.create({
          graph: workflow.graph,
          registry,
          resolveNodeType: resolver.resolveNodeType,
          context: fake.context,
          jobId: "certified-starter-gradient",
          providerConfiguration: () => []
        });
        const result = await session.result;

        expect(result.status).toBe("completed");
        expect(result.error ?? null).toBeNull();
        expect(Object.keys(result.outputs ?? {})).toEqual(["Output"]);
        const card = result.outputs?.Output;
        expect(card).toBeDefined();

        const output = (Array.isArray(card) ? card[0] : card) as Record<
          string,
          unknown
        >;
        expect(output).toEqual(
          expect.objectContaining({
            type: "image",
            mimeType: "image/png",
            width: 800,
            height: 480
          })
        );
        expect(output.data).toEqual(expect.stringMatching(/^iVBORw0KGgo/));
        expect((output.data as string).length).toBeGreaterThan(100);
      } finally {
        fake.cleanup();
      }
    },
    60_000
  );
});
