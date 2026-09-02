/**
 * The gate a run reads off its context, and the list of runs that skip it.
 *
 * A2 makes one permission ladder cover every host. Two things have to hold for
 * that: a loop the host never constructed must find the host's gate on the
 * context, and a loop that finds nothing must fail closed rather than build an
 * ungated run of its own. The second half is what let a chat in plan mode
 * mutate through an `AgentNode`, so the runs allowed to stay ungated are
 * enumerated here and the enumeration is checked against the sources.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { gateFromContext } from "../src/capabilities/gate-from-context.js";
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

  it("falls back to the headless gate when no host set one", () => {
    const gate = gateFromContext(contextWith({}), "kernel job runner");

    expect(gate.mode).toBe("auto");
    expect(gate.sessionAllow.size).toBe(0);
  });

  it("falls back to the headless gate when the context cannot answer", () => {
    expect(gateFromContext(undefined, "kernel job runner").mode).toBe("auto");
    expect(gateFromContext(null, "kernel job runner").mode).toBe("auto");
    expect(gateFromContext({}, "kernel job runner").mode).toBe("auto");
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
  ])("falls back to the headless gate on %s", (_label, stored) => {
    const context = contextWith({ [PERMISSION_GATE_CONTEXT_KEY]: stored });
    const gate = gateFromContext(context, "kernel job runner");

    expect(gate).not.toBe(stored);
    expect(gate.mode).toBe("auto");
    expect(gate.sessionAllow.size).toBe(0);
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

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

/**
 * Files allowed to name `ungatedCapabilityRun`, and why each one is not a hole.
 *
 * Two shapes qualify. A re-export moves the symbol without building a run. A
 * construction site qualifies when the `Tool` it builds is gated from outside
 * by `gateTools`, or when the capability it serves is read-class — reading a
 * SKILL.md has nothing for the ladder to withhold.
 */
const MAY_BE_UNGATED: Record<string, string> = {
  "capabilities/invoke.ts": "declares it",
  "capabilities/index.ts": "re-export",
  "index.ts": "re-export",
  "capabilities/lazy-tool.ts":
    "builds a Tool; the host gates it with gateTools",
  "capabilities/packs.ts": "reads a SKILL.md, a read-class call",
  "tools/serp-tool-factory.ts":
    "builds the one Tool a belt cannot assemble from the registry; " +
    "gated from outside like lazy-tool"
};

/**
 * The construction sites the design pins by name. Asserting they are present
 * is what stops this test passing on a grep that matched nothing — a renamed
 * symbol, or a walk that found no files, would otherwise read as clean.
 */
const MUST_REFERENCE = [
  "capabilities/invoke.ts",
  "capabilities/lazy-tool.ts",
  "capabilities/packs.ts"
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

describe("ungatedCapabilityRun users", () => {
  const referencing = [...sourceFiles(srcDir)]
    .filter((file) => readFileSync(file, "utf8").includes("ungatedCapabilityRun"))
    .map((file) => relative(srcDir, file).split("\\").join("/"))
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
