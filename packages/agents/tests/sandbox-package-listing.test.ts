/**
 * Pack discovery and the move of tool search onto the object model. Real
 * QuickJS actions against a fake catalog — no network, no model.
 */
import { describe, it, expect } from "vitest";
import type { ProcessingContext, SandboxModuleCatalog } from "@nodetool-ai/runtime";
import type {
  ResolvedSandboxModule,
  SandboxModuleSummary
} from "@nodetool-ai/protocol";
import { sandboxCapabilitySpecifier } from "@nodetool-ai/protocol";

import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import { CodeActExecutor } from "../src/codeact/codeact-executor.js";
import { scanModuleExports } from "../src/codeact/sandbox-package-listing.js";
import { SANDBOX_PACKAGE_LIST_TOOL_NAME } from "../src/capabilities/packs.specs.js";
import type { CapabilityRun } from "../src/capabilities/types.js";
import type { Step, Task } from "../src/types.js";
import { createMockContext } from "./_helpers/mock-context.js";

const GEO_SOURCE = `
export function distance(a, b) { return 0; }
export const UNIT = "km";
export default { distance };
`;

const SUMMARIES: SandboxModuleSummary[] = [
  {
    specifier: "@acme/geo",
    packName: "@acme/geo",
    packVersion: "1.0.0",
    kind: "js",
    description: "Great-circle distance helpers."
  },
  {
    specifier: "@acme/geo/grid",
    packName: "@acme/geo",
    packVersion: "1.0.0",
    kind: "js"
  },
  {
    specifier: "@nodetool-ai/sandbox-csv",
    packName: "@nodetool-ai/sandbox-csv",
    packVersion: "2.0.0",
    kind: "host",
    description: "Parse and write CSV text."
  }
];

function resolved(specifier: string): ResolvedSandboxModule | undefined {
  if (specifier === "@acme/geo" || specifier === "@acme/geo/grid") {
    return {
      specifier,
      packName: "@acme/geo",
      packVersion: "1.0.0",
      contentDigest: "a".repeat(64),
      moduleId: specifier,
      graph: [],
      kind: "js",
      source: GEO_SOURCE
    };
  }
  if (specifier === "@nodetool-ai/sandbox-csv") {
    return {
      specifier,
      packName: "@nodetool-ai/sandbox-csv",
      packVersion: "2.0.0",
      contentDigest: "b".repeat(64),
      moduleId: specifier,
      graph: [],
      kind: "host",
      hostId: "csv"
    };
  }
  return undefined;
}

const CATALOG: SandboxModuleCatalog = {
  summaries: () => SUMMARIES,
  diagnostics: () => [],
  packSkill: (packName) =>
    packName === "@acme/geo"
      ? {
          packName: "@acme/geo",
          packVersion: "1.0.0",
          trusted: true,
          name: "acme-geo",
          description: "Great-circle distance helpers.",
          body: "Call distance(a, b).",
          sections: {}
        }
      : undefined,
  resolveForExecution: (declarations) => {
    const modules: ResolvedSandboxModule[] = [];
    for (const declaration of declarations) {
      const module = resolved(declaration.specifier);
      if (module !== undefined) modules.push(module);
    }
    return {
      modules,
      statuses:
        modules.length === declarations.length
          ? []
          : [
              {
                packName: "unknown",
                specifier: declarations[0]?.specifier ?? "",
                status: "error",
                code: "module-not-found",
                message: "Sandbox module is not installed."
              }
            ]
    };
  }
};

function makeSession(options: {
  packages?: string[];
  withPlatform?: boolean;
}) {
  return createChatCodeActSession({
    tools: [
      {
        name: "add",
        description: "Add two numbers.",
        inputSchema: { type: "object", properties: {} }
      }
    ],
    executeTool: async () => ({}),
    context: createMockContext() as unknown as ProcessingContext,
    sandboxModuleCatalog: CATALOG,
    ...(options.packages === undefined
      ? {}
      : { sandboxPackages: options.packages }),
    ...(options.withPlatform === true
      ? { capabilityRun: {} as CapabilityRun }
      : {})
  });
}

async function run(
  session: ReturnType<typeof createChatCodeActSession>,
  code: string
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  return JSON.parse(await session.executeAction({ code })) as {
    ok: boolean;
    result?: unknown;
    error?: string;
  };
}

interface PackSummary {
  packName: string;
  allowed: boolean;
  kinds: string[];
  specifiers: string[];
}

describe("nodetool.searchTools", () => {
  it("answers under the object model", async () => {
    const session = makeSession({});
    const observation = await run(
      session,
      `const hits = await nodetool.searchTools("select:add");\nreturn hits[0];`
    );
    expect(observation.ok).toBe(true);
    expect(observation.result).toMatchObject({ name: "add" });
  }, 60_000);

  it("no longer exists as a bare global", async () => {
    const session = makeSession({});
    const observation = await run(session, `return typeof searchTools;`);
    expect(observation.ok).toBe(true);
    expect(observation.result).toBe("undefined");
  }, 60_000);
});

describe("nodetool.packs", () => {
  it("lists an allowed pack as allowed", async () => {
    const session = makeSession({ packages: ["@acme/geo"] });
    const observation = await run(
      session,
      `return await nodetool.packs.list();`
    );
    expect(observation.ok).toBe(true);
    const packs = observation.result as PackSummary[];
    const geo = packs.find((pack) => pack.packName === "@acme/geo");
    expect(geo?.allowed).toBe(true);
    // Consent is per pack, so the subpath is covered by the same entry.
    expect(geo?.specifiers).toEqual(["@acme/geo", "@acme/geo/grid"]);
  }, 60_000);

  it("marks an installed pack the session does not allow", async () => {
    const session = makeSession({ packages: ["@acme/geo"] });
    const observation = await run(
      session,
      `return await nodetool.packs.list();`
    );
    const packs = observation.result as PackSummary[];
    const csv = packs.find(
      (pack) => pack.packName === "@nodetool-ai/sandbox-csv"
    );
    expect(csv?.allowed).toBe(false);
  }, 60_000);

  it("lists installed packs for a session that allows none", async () => {
    const session = makeSession({});
    const observation = await run(
      session,
      `const packs = await nodetool.packs.list();
       return packs.map((p) => p.packName + ":" + p.allowed);`
    );
    expect(observation.ok).toBe(true);
    expect(observation.result).toEqual([
      "@acme/geo:false",
      "@nodetool-ai/sandbox-csv:false"
    ]);
  }, 60_000);

  it("reports the modules one pack declares", async () => {
    const session = makeSession({ packages: ["@acme/geo"] });
    const observation = await run(
      session,
      `return await nodetool.packs.modules("@acme/geo");`
    );
    expect(observation.ok).toBe(true);
    expect(observation.result).toEqual([
      {
        specifier: "@acme/geo",
        kind: "js",
        description: "Great-circle distance helpers.",
        allowed: true
      },
      { specifier: "@acme/geo/grid", kind: "js", allowed: true }
    ]);
  }, 60_000);

  it("reads a guest module's exports off its own export statements", async () => {
    const session = makeSession({ packages: ["@acme/geo"] });
    const observation = await run(
      session,
      `return await nodetool.packs.exports("@acme/geo");`
    );
    expect(observation.ok).toBe(true);
    expect(observation.result).toEqual({
      specifier: "@acme/geo",
      kind: "js",
      exports: ["UNIT", "default", "distance"],
      complete: true
    });
  }, 60_000);

  it("reads a host module's exports off the host registry", async () => {
    const session = makeSession({ packages: ["@nodetool-ai/sandbox-csv"] });
    const observation = await run(
      session,
      `return await nodetool.packs.exports("@nodetool-ai/sandbox-csv");`
    );
    expect(observation.ok).toBe(true);
    expect(observation.result).toMatchObject({
      kind: "host",
      exports: ["parse", "stringify"],
      complete: true
    });
  }, 60_000);

  it("refuses exports for a pack off the allowlist", async () => {
    const session = makeSession({ packages: ["@acme/geo"] });
    const observation = await run(
      session,
      `return await nodetool.packs.exports("@nodetool-ai/sandbox-csv");`
    );
    expect(observation.ok).toBe(false);
    expect(observation.error).toContain("not on this session's package allowlist");
  }, 60_000);

  it("serves a pack's documentation", async () => {
    const session = makeSession({ packages: ["@acme/geo"] });
    const observation = await run(
      session,
      `return (await nodetool.packs.docs("@acme/geo")).documentation;`
    );
    expect(observation.ok).toBe(true);
    expect(observation.result).toBe("Call distance(a, b).");
  }, 60_000);

  it("lists the platform modules a session mounts, and their exports", async () => {
    const session = makeSession({ withPlatform: true });
    const specifier = sandboxCapabilitySpecifier("workflows");
    const observation = await run(
      session,
      `const packs = await nodetool.packs.list();
       const platform = packs.find((p) => p.packName === "@nodetool-ai/sandbox-nodetool");
       const exported = await nodetool.packs.exports(${JSON.stringify(specifier)});
       return { specifiers: platform.specifiers, kind: exported.kind, has: exported.exports.indexOf("list_workflows") >= 0 };`
    );
    expect(observation.ok).toBe(true);
    expect(observation.result).toMatchObject({ kind: "platform", has: true });
    expect(
      (observation.result as { specifiers: string[] }).specifiers
    ).toContain(specifier);
  }, 60_000);

  it("says nothing about platform modules without a capability run", async () => {
    const session = makeSession({});
    const observation = await run(
      session,
      `const packs = await nodetool.packs.list();
       return packs.some((p) => p.packName === "@nodetool-ai/sandbox-nodetool");`
    );
    expect(observation.result).toBe(false);
  }, 60_000);
});

describe("the step executor carries the same discovery", () => {
  const STEP: Step = {
    id: "step_1",
    instructions: "Do the thing.",
    dependsOn: [],
    completed: false,
    logs: []
  };
  const TASK: Task = { id: "task_1", title: "Task", steps: [STEP] };

  function executorInternals(packages?: string[]) {
    const context = createMockContext() as Record<string, unknown>;
    context["sandboxModuleCatalog"] = CATALOG;
    const executor = new CodeActExecutor({
      task: TASK,
      step: STEP,
      context: context as never,
      provider: { provider: "fake" } as never,
      model: "m",
      tools: [],
      ...(packages === undefined ? {} : { sandboxPackages: packages })
    });
    return executor as unknown as {
      systemPrompt: string;
      tools: Array<{ name: string }>;
    };
  }

  it("carries the listing tool and advertises it", () => {
    const internals = executorInternals(["@acme/geo"]);
    expect(internals.tools.map((tool) => tool.name)).toContain(
      SANDBOX_PACKAGE_LIST_TOOL_NAME
    );
    expect(internals.systemPrompt).toContain("await nodetool.packs.list()");
    // One surface per capability: never as a raw signature in the catalog.
    expect(internals.systemPrompt).not.toContain(
      `await ${SANDBOX_PACKAGE_LIST_TOOL_NAME}(`
    );
  });
});

describe("scanModuleExports", () => {
  it("collects declarations, specifiers, and destructured names", () => {
    expect(
      scanModuleExports(
        `export function a() {}
         export class B {}
         const c = 1, d = 2;
         export { c, d as e };
         export const { f, g: [h] } = {};`
      )
    ).toEqual({
      exports: ["B", "a", "c", "e", "f", "h"],
      complete: true
    });
  });

  it("reports a star re-export as an incomplete answer", () => {
    const scanned = scanModuleExports(
      `export * from "./other.js";\nexport const here = 1;`
    );
    expect(scanned.exports).toEqual(["here"]);
    expect(scanned.complete).toBe(false);
    expect(scanned.note).toContain("export *");
  });

  it("names a module it cannot parse instead of answering with a guess", () => {
    const scanned = scanModuleExports("export function (");
    expect(scanned.exports).toBeNull();
    expect(scanned.complete).toBe(false);
  });
});
