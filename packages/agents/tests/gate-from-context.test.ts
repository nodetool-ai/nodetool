/**
 * The gate a run reads off its context, and the list of runs that skip it.
 *
 * A2 makes one permission ladder cover every host. Two things have to hold for
 * that: a loop the host never constructed must find the host's gate on the
 * context, and a loop that finds nothing must fail closed rather than build an
 * ungated run of its own. Every host sets a gate — a headless one sets
 * `headlessGate` itself — so a context with none is a bug, and the answer is
 * a gate that reads but denies everything else. The second half is what let a
 * chat in plan mode mutate through an `AgentNode`, so the runs allowed to stay
 * ungated are enumerated here and the enumeration is checked against the
 * sources.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { gateFromContext } from "../src/capabilities/gate-from-context.js";

const logged = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@nodetool-ai/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/config")>();
  return {
    ...actual,
    createLogger: (name: string) =>
      name === "nodetool.agents.gate-from-context"
        ? { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: logged.error }
        : actual.createLogger(name)
  };
});
import {
  decidePermission,
  headlessDenialReason,
  headlessGate,
  type ApprovalRequest,
  type PermissionCategory,
  type PermissionGateOptions
} from "../src/tools/tool-permissions.js";
import { PERMISSION_GATE_CONTEXT_KEY } from "../src/types.js";

/** A context bag with the one method `gateFromContext` reads. */
function contextWith(values: Record<string, unknown>): {
  get<T = unknown>(key: string, defaultValue?: T): T;
} {
  return {
    get<T = unknown>(key: string, defaultValue?: T): T {
      const value = key in values ? values[key] : defaultValue;
      // The real ProcessingContext.get is typed the same way and is just as
      // unchecked; gateFromContext validates what comes back, not the getter.
      return value as T;
    }
  };
}

const approvalRequest: ApprovalRequest = {
  toolName: "delete_workflow",
  category: "write",
  args: {},
  message: "Delete the workflow"
};

function hostGate(): PermissionGateOptions {
  return {
    mode: "plan",
    sessionAllow: new Set<string>(["read_file"]),
    requestApproval: async () => "allow"
  };
}

describe("gateFromContext", () => {
  it("returns the gate the host set, by reference", () => {
    const gate = hostGate();
    const context = contextWith({ [PERMISSION_GATE_CONTEXT_KEY]: gate });

    // By reference, because the live mode getter and the session allow-list
    // are shared state: a copy would freeze the mode a node started with.
    expect(gateFromContext(context, "chat turn")).toBe(gate);
  });

  it("fails closed when no host set one: reads run, everything else is denied", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const gate = gateFromContext(contextWith({}), "kernel job runner");

      expect(gate.mode).toBe("default");
      expect(gate.sessionAllow.size).toBe(0);
      expect(decidePermission(gate.mode, "read")).toBe("allow");
      for (const category of ["write", "execute", "external"] as const) {
        expect(decidePermission(gate.mode, category)).toBe("ask");
      }
      await expect(gate.requestApproval(approvalRequest)).resolves.toBe("deny");
    } finally {
      warn.mockRestore();
    }
  });

  it("is not the headless gate: a forgotten gate never runs auto", () => {
    expect(gateFromContext(contextWith({}), "kernel job runner").mode).not.toBe(
      headlessGate("kernel job runner").mode
    );
  });

  it("fails closed when the context cannot answer", () => {
    expect(gateFromContext(undefined, "kernel job runner").mode).toBe("default");
    expect(gateFromContext(null, "kernel job runner").mode).toBe("default");
    expect(gateFromContext({}, "kernel job runner").mode).toBe("default");
  });

  it.each([
    ["a string", "auto"],
    ["a mode with no approver", { mode: "auto", sessionAllow: new Set() }],
    [
      "an unknown mode",
      {
        mode: "yolo",
        sessionAllow: new Set(),
        requestApproval: async () => "allow"
      }
    ],
    [
      "an allow-list that is not a Set",
      {
        mode: "auto",
        sessionAllow: ["read_file"],
        requestApproval: async () => "allow"
      }
    ]
  ])("fails closed on %s", (_label, stored) => {
    const context = contextWith({ [PERMISSION_GATE_CONTEXT_KEY]: stored });
    const gate = gateFromContext(context, "kernel job runner");

    expect(gate).not.toBe(stored);
    expect(gate.mode).toBe("default");
    expect(gate.sessionAllow.size).toBe(0);
  });

  it("logs an error once per host when no gate is on the context", () => {
    logged.error.mockClear();
    const host = "absent-gate canary host";

    gateFromContext(contextWith({}), host);
    gateFromContext(contextWith({}), host);
    gateFromContext(undefined, host);

    expect(logged.error).toHaveBeenCalledTimes(1);
    const message = String(logged.error.mock.calls[0]?.[0]);
    expect(message).toContain(host);
    expect(message).toContain("denying every call past read");
    expect(message).toContain("PERMISSION_GATE_CONTEXT_KEY");
  });

  it("does not log when the host set a gate", () => {
    logged.error.mockClear();
    const context = contextWith({ [PERMISSION_GATE_CONTEXT_KEY]: hostGate() });

    gateFromContext(context, "gated canary host");

    expect(logged.error).not.toHaveBeenCalled();
  });

  it("gives each caller its own session allow-list", () => {
    const first = gateFromContext(contextWith({}), "kernel job runner");
    const second = gateFromContext(contextWith({}), "kernel job runner");

    first.sessionAllow.add("delete_workflow");

    expect(second.sessionAllow.has("delete_workflow")).toBe(false);
  });
});

describe("headlessGate", () => {
  it("denies, naming the host that had nobody to ask", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const gate = headlessGate("kernel job runner");

      await expect(gate.requestApproval(approvalRequest)).resolves.toBe("deny");
      expect(warn).toHaveBeenCalledTimes(1);
      const reported = String(warn.mock.calls[0]?.[0]);
      expect(reported).toContain("kernel job runner");
      expect(reported).toContain("delete_workflow");
      expect(reported).toContain(headlessDenialReason("kernel job runner"));
    } finally {
      warn.mockRestore();
    }
  });

  it("is reached only by an escalation: auto allows every category", () => {
    const categories: PermissionCategory[] = [
      "read",
      "write",
      "execute",
      "external"
    ];

    for (const category of categories) {
      expect(decidePermission("auto", category)).toBe("allow");
    }
  });
});

// ---------------------------------------------------------------------------
// The runs that stay ungated
// ---------------------------------------------------------------------------

const packagesDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.."
);

/**
 * Files allowed to name `ungatedCapabilityRun`, and why each one is not a hole.
 *
 * Two shapes qualify. A re-export moves the symbol without building a run. A
 * construction site qualifies when the `Tool` it builds is gated from outside
 * by `gateTools`, or when the capability it serves is read-class — reading a
 * SKILL.md has nothing for the ladder to withhold.
 *
 * The walk covers every package's `src`, not just this package's: the
 * `nodetool.code.Code` node built its run in `packages/code-nodes`, so a walk
 * scoped to `agents/src` reported a clean ladder while the node mounted its
 * capability modules ungated.
 */
const MAY_BE_UNGATED: Record<string, string> = {
  "agents/src/capabilities/invoke.ts": "declares it",
  "agents/src/capabilities/index.ts": "re-export",
  "agents/src/index.ts": "re-export",
  "agents/src/capabilities/lazy-tool.ts":
    "builds a Tool; the host gates it with gateTools",
  "agents/src/capabilities/packs.ts": "reads a SKILL.md, a read-class call",
  "agents/src/tools/serp-tool-factory.ts":
    "builds the one Tool a belt cannot assemble from the registry; " +
    "gated from outside like lazy-tool"
};

/**
 * The construction sites the design pins by name. Asserting they are present
 * is what stops this test passing on a grep that matched nothing — a renamed
 * symbol, or a walk that found no files, would otherwise read as clean.
 */
const MUST_REFERENCE = [
  "agents/src/capabilities/invoke.ts",
  "agents/src/capabilities/lazy-tool.ts",
  "agents/src/capabilities/packs.ts"
];

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (entry.endsWith(".ts")) yield full;
  }
}

/** Every `packages/<name>/src` in the monorepo, skipping packages without one. */
function* packageSourceDirs(root: string): Generator<string> {
  for (const entry of readdirSync(root)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const src = join(root, entry, "src");
    if (existsSync(src) && statSync(src).isDirectory()) yield src;
  }
}

/**
 * Files allowed to build a run on `UNGATED` directly, and why each is not a
 * hole. A construction site qualifies when the `Tool` built over the run is
 * wrapped by `gateTools` from outside, or when the run only serves a call the
 * ladder already admitted (a nested run inside a gated capability).
 */
const MAY_BUILD_UNGATED: Record<string, string> = {
  "agents/src/capabilities/invoke.ts": "declares it",
  "agents/src/capabilities/index.ts": "re-export",
  "agents/src/index.ts": "re-export",
  "agents/src/capabilities/files.ts":
    "fileCapabilityRun backs CapabilityTool instances a host wraps in gateTools",
  "agents/src/capabilities/google.ts":
    "googleCapabilityRun backs CapabilityTool instances a host wraps in gateTools",
  "agents/src/capabilities/scripts.ts":
    "nested generate_speech run inside voice_script_lines, a write-class " +
    "call the ladder already admitted",
  "agents/src/tools/mcp-tools.ts":
    "builds lazy Tools for the MCP/CLI/chat belts; every host wraps that " +
    "belt in gateTools",
  "websocket/src/mcp-agent-tools.ts":
    "inner runs for loader-carrying Tools; registerAgentMcpTools wraps the " +
    "whole belt in gateTools",
  "websocket/src/session/chat-turn.ts":
    "delegation run for run_subtask/start_subtask/wait_subtasks, read-class " +
    "spawns whose children act through the gated belt"
};

describe("UNGATED construction sites", () => {
  const referencing = [...packageSourceDirs(packagesDir)]
    .flatMap((dir) => [...sourceFiles(dir)])
    .filter((file) => /\bUNGATED\b/.test(readFileSync(file, "utf8")))
    .map((file) => relative(packagesDir, file).split("\\").join("/"))
    .sort();

  it("finds the declaration", () => {
    expect(referencing).toContain("agents/src/capabilities/invoke.ts");
  });

  it("is built in no other file", () => {
    const unlisted = referencing.filter((file) => !(file in MAY_BUILD_UNGATED));

    expect(unlisted).toEqual([]);
  });

  it("author-graph builds its belt on the caller's gate, not UNGATED", () => {
    expect(referencing).not.toContain("agents/src/author-graph.ts");
  });
});

describe("ungatedCapabilityRun users", () => {
  const referencing = [...packageSourceDirs(packagesDir)]
    .flatMap((dir) => [...sourceFiles(dir)])
    .filter((file) => readFileSync(file, "utf8").includes("ungatedCapabilityRun"))
    .map((file) => relative(packagesDir, file).split("\\").join("/"))
    .sort();

  it("finds the sites the design names", () => {
    for (const file of MUST_REFERENCE) {
      expect(referencing).toContain(file);
    }
  });

  it("is referenced from no other file", () => {
    const unlisted = referencing.filter((file) => !(file in MAY_BE_UNGATED));

    expect(unlisted).toEqual([]);
  });
});
