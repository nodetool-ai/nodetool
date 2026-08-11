/**
 * Tests for `installedSandboxPacks` and the GraphPlanner wiring behind it.
 *
 * The planner may advertise only packs this machine installed. A prompt that
 * names a pack nobody installed makes `submit_graph` reject the graph, which
 * is the failure this catalog exists to prevent.
 */
import { describe, it, expect } from "vitest";
import type {
  BaseProvider,
  ProcessingContext,
  SandboxModuleCatalog
} from "@nodetool-ai/runtime";
import { setProcessSandboxModuleCatalog } from "@nodetool-ai/runtime";
import type { SandboxModuleSummary } from "@nodetool-ai/protocol";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";

import { GraphPlanner } from "../src/graph-planner.js";
import { AGENT_NODE_TYPE } from "../src/graph-builder.js";
import { installedSandboxPacks } from "../src/prompts/sandbox-pack-catalog.js";
import { createMockContext } from "./_helpers/mock-context.js";

const stubRegistry = {
  has: (type: string) => type === AGENT_NODE_TYPE,
  getMetadata: () => undefined,
  listMetadata: () => []
} as unknown as NodeRegistry;

function catalogOf(
  summaries: readonly Partial<SandboxModuleSummary>[]
): SandboxModuleCatalog {
  const full = summaries.map((summary) => ({
    specifier: "@nodetool-ai/sandbox-x",
    packName: "@nodetool-ai/sandbox-x",
    kind: "host" as const,
    contentDigest: "digest",
    ...summary
  }));
  return {
    summaries: () => full,
    diagnostics: () => [],
    resolveForExecution: () => ({ modules: [], statuses: [] }),
    authorizeDelivery: () =>
      Promise.resolve({
        authorized: false as const,
        reason: "not-found" as const,
        message: "no"
      })
  };
}

describe("installedSandboxPacks", () => {
  it("reports every installed pack with its own description, sorted", () => {
    const packs = installedSandboxPacks(
      catalogOf([
        {
          specifier: "@nodetool-ai/sandbox-yaml",
          packName: "@nodetool-ai/sandbox-yaml",
          description: "Parse and write YAML."
        },
        {
          specifier: "@nodetool-ai/sandbox-csv",
          packName: "@nodetool-ai/sandbox-csv",
          description: "Parse and write CSV."
        }
      ])
    );

    expect(packs).toEqual([
      {
        specifier: "@nodetool-ai/sandbox-csv",
        summary: "Parse and write CSV."
      },
      {
        specifier: "@nodetool-ai/sandbox-yaml",
        summary: "Parse and write YAML."
      }
    ]);
  });

  it("answers nothing for an empty catalog", () => {
    expect(installedSandboxPacks(catalogOf([]))).toEqual([]);
  });

  it("answers nothing when there is no catalog at all", () => {
    expect(installedSandboxPacks(undefined)).toEqual([]);
    expect(installedSandboxPacks()).toEqual([]);
  });

  it("flattens a multi-line description and caps it", () => {
    const packs = installedSandboxPacks(
      catalogOf([
        { specifier: "@a/one", description: " Parses\n   things.  " },
        { specifier: "@a/two", description: "x".repeat(400) }
      ])
    );

    expect(packs[0]?.summary).toBe("Parses things.");
    expect(packs[1]?.summary).toHaveLength(120);
  });

  it("keeps a pack that ships no description, with an empty summary", () => {
    const packs = installedSandboxPacks(catalogOf([{ specifier: "@a/one" }]));
    expect(packs).toEqual([{ specifier: "@a/one", summary: "" }]);
  });

  it("reports one entry per specifier", () => {
    const packs = installedSandboxPacks(
      catalogOf([
        { specifier: "@a/one", description: "First." },
        { specifier: "@a/one", description: "Duplicate." }
      ])
    );
    expect(packs).toEqual([{ specifier: "@a/one", summary: "First." }]);
  });
});

/**
 * Run the planner far enough to see the system prompt it planned with. The
 * provider calls no tool, so the attempt ends without a graph — the prompt is
 * all this asks for.
 */
async function promptFor(
  contextCatalog: SandboxModuleCatalog | null | undefined,
  optionCatalog?: SandboxModuleCatalog
): Promise<string> {
  let systemPrompt = "";
  const provider = {
    provider: "scripted",
    hasToolSupport: async () => true,
    async *generateLoop(args: {
      messages: Array<{ role: string; content: string }>;
    }): AsyncGenerator<unknown> {
      const system = args.messages.find((m) => m.role === "system");
      if (system !== undefined) systemPrompt = system.content;
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;

  const context = createMockContext() as unknown as ProcessingContext;
  if (contextCatalog !== undefined) {
    (context as { sandboxModuleCatalog: SandboxModuleCatalog | null }).sandboxModuleCatalog =
      contextCatalog;
  }

  const planner = new GraphPlanner({
    provider,
    model: "scripted",
    registry: stubRegistry,
    maxRetries: 1,
    refineCodeNodes: false,
    ...(optionCatalog === undefined
      ? {}
      : { sandboxModuleCatalog: optionCatalog })
  });

  const gen = planner.plan("build something", context);
  let next = await gen.next();
  while (!next.done) next = await gen.next();
  return systemPrompt;
}

describe("GraphPlanner prompt", () => {
  it("advertises the packs the context's catalog carries", async () => {
    const prompt = await promptFor(
      catalogOf([
        {
          specifier: "@nodetool-ai/sandbox-csv",
          description: "Parse and write CSV."
        }
      ])
    );
    expect(prompt).toContain("@nodetool-ai/sandbox-csv");
    expect(prompt).toContain("Parse and write CSV.");
    expect(prompt).not.toContain("@nodetool-ai/sandbox-pptx");
  });

  it("advertises no pack when the context has no catalog", async () => {
    const prompt = await promptFor(null);
    expect(prompt).not.toContain("@nodetool-ai/sandbox-");
    expect(prompt).toContain("No sandbox packages are installed.");
  });

  it("falls back to the process catalog when the context carries none", async () => {
    setProcessSandboxModuleCatalog(
      catalogOf([{ specifier: "@process/pack", description: "From the process." }])
    );
    try {
      const prompt = await promptFor(undefined);
      expect(prompt).toContain("@process/pack");
    } finally {
      setProcessSandboxModuleCatalog(null);
    }
  });

  it("advertises no pack when the context refuses one", async () => {
    setProcessSandboxModuleCatalog(
      catalogOf([{ specifier: "@process/pack", description: "From the process." }])
    );
    try {
      const prompt = await promptFor(null);
      expect(prompt).not.toContain("@process/pack");
    } finally {
      setProcessSandboxModuleCatalog(null);
    }
  });

  it("takes an explicit catalog over the context's", async () => {
    const prompt = await promptFor(
      catalogOf([{ specifier: "@ctx/pack", description: "From the context." }]),
      catalogOf([{ specifier: "@opt/pack", description: "From the option." }])
    );
    expect(prompt).toContain("@opt/pack");
    expect(prompt).not.toContain("@ctx/pack");
  });
});
