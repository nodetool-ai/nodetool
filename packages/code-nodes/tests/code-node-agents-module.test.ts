/**
 * Where `nodetool.code.Code` gets the agents package from.
 *
 * The node resolves `@nodetool-ai/agents` by bare specifier, which works in a
 * checkout and fails in the bundled backend (esbuild inlines every workspace
 * package into `server.mjs`, so nothing is left on disk to resolve). A host
 * that already holds the module hands it over with
 * `setCodeNodeAgentsModule`, and that is what keeps the toolbelt and the
 * `@nodetool-ai/sandbox-nodetool/*` imports — `yt_dlp` among them — alive in
 * the desktop app and the Docker image.
 */
import { describe, it, expect, afterEach } from "vitest";
import {
  CodeNode,
  setCodeNodeAgentsModule,
  setCodeNodeTools
} from "@nodetool-ai/code-nodes";
import * as agents from "@nodetool-ai/agents";
import { Tool } from "@nodetool-ai/agents";
import type { ProcessingContext } from "@nodetool-ai/runtime";

type AgentsModule = Parameters<typeof setCodeNodeAgentsModule>[0];

/** Minimal context: nothing below reads it. */
const fakeContext = {} as unknown as ProcessingContext;

class MarkerTool extends Tool {
  readonly name = "list_workflows";
  readonly description = "Marker tool served only by the injected module.";
  async process(): Promise<unknown> {
    return [{ id: "wf_injected", name: "Injected" }];
  }
}

function runNode(
  code: string,
  context?: ProcessingContext
): Promise<Record<string, unknown>> {
  return new CodeNode({ code }).process(context);
}

afterEach(() => {
  setCodeNodeAgentsModule(null);
  setCodeNodeTools(null);
});

describe("CodeNode — injected agents module", () => {
  it("builds the toolbelt from the injected module, not the resolved one", async () => {
    const marker = new MarkerTool();
    const injected = {
      ...agents,
      assembleSandboxToolbelt: () => [marker]
    } as unknown as AgentsModule;
    setCodeNodeAgentsModule(injected);

    const result = await runNode(
      `
      const names = __toolNames.slice().sort();
      const wfs = await nodetool.workflows.list({});
      return { names, ids: wfs.map((w) => w.id) };
      `,
      fakeContext
    );
    // The real belt carries dozens of tools; the injected one carries exactly
    // this marker, so the belt could only have come from the injection.
    expect(result["names"]).toEqual(["list_workflows"]);
    expect(result["ids"]).toEqual(["wf_injected"]);
  }, 60_000);

  it("mounts capability modules through the injected module", async () => {
    const mounted: string[] = [];
    const injected = {
      ...agents,
      mountCapabilityModules: async (code: string, run: unknown) => {
        mounted.push(code);
        return agents.mountCapabilityModules(
          code,
          run as Parameters<typeof agents.mountCapabilityModules>[1]
        );
      }
    } as unknown as AgentsModule;
    setCodeNodeAgentsModule(injected);

    const result = await runNode(
      `
      import { yt_dlp } from "@nodetool-ai/sandbox-nodetool/media";
      return { kind: typeof yt_dlp };
      `,
      fakeContext
    );
    expect(result).toEqual({ kind: "function" });
    expect(mounted).toHaveLength(1);
  }, 60_000);

  it("goes back to resolving the specifier once the injection is cleared", async () => {
    setCodeNodeAgentsModule({
      ...agents,
      assembleSandboxToolbelt: () => []
    } as unknown as AgentsModule);
    setCodeNodeAgentsModule(null);

    const result = await runNode(
      `return { hasYtDlp: __toolNames.includes("yt_dlp") };`,
      fakeContext
    );
    expect(result).toEqual({ hasYtDlp: true });
  }, 60_000);
});
