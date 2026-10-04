import { describe, expect, it, vi } from "vitest";
import { InMemoryStorageAdapter } from "@nodetool-ai/storage";
import { createWorkspace, ProcessingContext } from "@nodetool-ai/runtime";
import { enterSubAgentDepth } from "../src/subagent.js";
import { enterJsScript } from "../src/capabilities/js-scripts.js";

describe("child context host dependencies", () => {
  const boundaries = [
    {
      name: "subagent",
      enter(parent: ProcessingContext): ProcessingContext {
        const result = enterSubAgentDepth(parent, 3);
        if (!result.ok) {
          throw new Error("Subagent was refused");
        }
        return result.childCtx;
      }
    },
    {
      name: "JS script",
      enter(parent: ProcessingContext): ProcessingContext {
        const result = enterJsScript(parent, "script", 3);
        if (!result.ok) {
          throw new Error("JS script was refused");
        }
        return result.childContext;
      }
    }
  ];

  it.each(boundaries)(
    "preserves the workspace and lifecycle for a $name",
    async ({ enter }) => {
      const workspace = createWorkspace(new InMemoryStorageAdapter(), {
        prefix: "ws-1"
      });
      const onGenerationAccepted = vi.fn();
      const onGenerationTerminal = vi.fn();
      const parent = new ProcessingContext({
        jobId: "job",
        workspace,
        generationLifecycle: { onGenerationAccepted, onGenerationTerminal }
      });
      const child = enter(parent);

      expect(child.workspace).toBe(parent.workspace);
      await child.workspace!.write("child.txt", "child output");
      expect(await workspace.readText("child.txt")).toBe("child output");
      const request = {
        id: "boundary-generation",
        provider: "fake",
        capability: "text_to_image",
        model: "fake-image",
        params: {}
      } as const;
      const output = new Uint8Array([1, 2, 3]);
      await child.runGenerationWith(request, async () => output, {
        withoutProvider: true
      });
      expect(onGenerationAccepted).toHaveBeenCalledExactlyOnceWith({
        generationId: request.id,
        request
      });
      expect(onGenerationTerminal).toHaveBeenCalledExactlyOnceWith({
        generationId: request.id,
        request,
        status: "completed",
        output,
        receipt: null,
        assetIds: []
      });
    }
  );
});
