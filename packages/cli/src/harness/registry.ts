/**
 * The harness registry — the machine-readable inventory behind
 * harness-first engineering (docs/HARNESS_FIRST.md).
 *
 * Two lists, one invariant:
 *
 *  - HARNESSES: every headless, agent-drivable way to exercise a NodeTool
 *    surface — validate it, run it, replay interactions against it, or score
 *    a model driving it.
 *  - SURFACES: every product surface a user (or agent) can touch. Each names
 *    the harnesses that cover it, or carries a `gap` note saying why nothing
 *    does yet and what a harness for it would look like.
 *
 * The invariant — no surface without a harness or a documented gap — is
 * enforced two ways: `nodetool harness audit` reports it (exit 1 with
 * `--strict` on any gap), and tests/harness-registry.test.ts fails the build
 * on an undocumented one. Shipping a new surface means adding it here, which
 * means either pointing at its harness or writing down the debt.
 */

export type HarnessKind = "static" | "execution" | "eval" | "meta";

export type HarnessCapability =
  | "json" // machine-readable report (--json or JSON file output)
  | "watch" // re-run on save with a verdict diff
  | "supervise" // agent/LLM on the failure path (--supervise / interactive)
  | "interact" // scripted interaction sequences
  | "browser" // real-browser surface (Playwright)
  | "no-db" // can run hermetically, no database
  | "gated"; // wired into CI as a pass/fail gate

export interface HarnessEntry {
  id: string;
  title: string;
  /** Canonical invocation, copy-pasteable from the repo root. */
  command: string;
  kind: HarnessKind;
  capabilities: HarnessCapability[];
  /** Server-side agent tool exposing the same check, when one exists. */
  agentTool?: string;
  /** Where the harness is documented (repo-relative). */
  docs: string;
}

export interface SurfaceEntry {
  id: string;
  title: string;
  /** Harness ids that cover this surface. */
  harnesses: string[];
  /**
   * Required when `harnesses` is empty: why the surface is uncovered and
   * what a harness for it would look like. An empty list without a gap note
   * fails the registry test.
   */
  gap?: string;
}

export const HARNESSES: HarnessEntry[] = [
  {
    id: "validate",
    title: "Static workflow check",
    command: "nodetool validate <id|file.json|file.ts>",
    kind: "static",
    capabilities: ["json", "no-db"],
    agentTool: "validate_workflow",
    docs: "CLAUDE.md § nodetool validate"
  },
  {
    id: "debug",
    title: "Workflow debug harness (server + browser surfaces)",
    command: "nodetool debug <id|file> [--browser --trace --watch --supervise]",
    kind: "execution",
    capabilities: ["json", "watch", "supervise", "browser", "gated"],
    agentTool: "debug_workflow",
    docs: "CLAUDE.md § nodetool debug"
  },
  {
    id: "node-run",
    title: "Single-node harness",
    command: "nodetool node run <type> --props '{...}' [--no-secrets]",
    kind: "execution",
    capabilities: ["json", "no-db"],
    docs: "CLAUDE.md § nodetool node run"
  },
  {
    id: "app-debug",
    title: "Mini-app debug harness",
    command: "nodetool app debug <id|bundle.json> [--interact ... --no-run]",
    kind: "execution",
    capabilities: ["json", "interact", "no-db"],
    docs: "CLAUDE.md § nodetool app debug"
  },
  {
    id: "app-build",
    title: "Mini-app build harness (spec→plan→author→check→run→judge)",
    command: "nodetool app build <prompt|spec.json> -p <provider> -m <model>",
    kind: "execution",
    capabilities: ["json", "watch", "supervise", "gated"],
    agentTool: "build_app",
    docs: "CLAUDE.md § nodetool app build"
  },
  {
    id: "timeline-validate",
    title: "Timeline static check",
    command: "nodetool timeline validate <id|file.json>",
    kind: "static",
    capabilities: ["json", "no-db"],
    agentTool: "validate_timeline",
    docs: "CLAUDE.md § nodetool timeline validate / debug"
  },
  {
    id: "timeline-debug",
    title: "Timeline edit-session replay",
    command: "nodetool timeline debug <id|file.json> --interact '[...]'",
    kind: "execution",
    capabilities: ["json", "interact", "no-db"],
    docs: "CLAUDE.md § nodetool timeline validate / debug"
  },
  {
    id: "eval",
    title:
      "Agent evaluation suites (graph-planner, graph-e2e, code-gen, task-planner, script-planner, tool-loop×8, app-build)",
    command: "nodetool eval <suite> -p <provider> -m <model> [--min-success N]",
    kind: "eval",
    capabilities: ["json", "gated"],
    docs: "packages/agents/CLAUDE.md"
  },
  {
    id: "chat-stdin",
    title: "Headless chat agent (piped stdin)",
    command: 'echo "<prompt>" | nodetool-chat -p <provider> -m <model>',
    kind: "execution",
    capabilities: [],
    docs: "CLAUDE.md § nodetool chat"
  },
  {
    id: "backend-smoke",
    title: "Packaged-backend smoke (bundle staging + /health boot)",
    command: "npm run backend:smoke",
    kind: "meta",
    capabilities: ["gated"],
    docs: "CLAUDE.md § Common Pitfalls (bundle-backend)"
  },
  {
    id: "docker-smoke",
    title: "Deploy-image smoke (build, boot, load app in a browser)",
    command: "node scripts/docker-smoke.mjs http://localhost:7777",
    kind: "meta",
    capabilities: ["browser", "gated"],
    docs: "CLAUDE.md § Common Pitfalls (deploy)"
  },
  {
    id: "affected",
    title: "Changed-file → workspace mapping",
    command: "nodetool affected [--base main]",
    kind: "meta",
    capabilities: ["json", "no-db"],
    docs: "CLAUDE.md § nodetool affected"
  },
  {
    id: "harness-audit",
    title: "Harness coverage audit (this registry)",
    command: "nodetool harness audit [--strict]",
    kind: "meta",
    capabilities: ["json", "no-db", "gated"],
    docs: "docs/HARNESS_FIRST.md"
  }
];

export const SURFACES: SurfaceEntry[] = [
  {
    id: "workflow-execution",
    title: "Workflow execution (kernel runner)",
    harnesses: ["validate", "debug", "node-run"]
  },
  {
    id: "workflow-authoring",
    title: "Workflow authoring (planners + ui_* graph tools)",
    harnesses: ["validate", "eval"]
  },
  {
    id: "mini-apps",
    title: "Mini apps (documents, bindings, operations)",
    harnesses: ["app-debug", "app-build", "eval"]
  },
  {
    id: "timeline",
    title: "Timeline sequences (ui_timeline_* tools)",
    harnesses: ["timeline-validate", "timeline-debug", "eval"]
  },
  {
    id: "chat-agent",
    title: "Chat agent loop (unified tool-calling loop)",
    harnesses: ["chat-stdin", "eval"]
  },
  {
    id: "web-editor",
    title: "Web editor (graph canvas, run rendering)",
    harnesses: ["debug", "docker-smoke"]
  },
  {
    id: "desktop-backend",
    title: "Packaged Electron backend (bundled server.mjs)",
    harnesses: ["backend-smoke"]
  },
  {
    id: "deploy-image",
    title: "Deployed GHCR image (Fly.io / self-hosted)",
    harnesses: ["docker-smoke"]
  },
  {
    id: "mobile",
    title: "Mobile app (documents via chat agent ui_* tools)",
    harnesses: [],
    gap:
      "No headless harness yet. Mobile edits already flow through the chat " +
      "agent's ui_* tools (mobile/ARCHITECTURE.md § Documents), so the harness " +
      "shape exists: drive the same tool contract against a headless bridge " +
      "the way the tool-loop evals do, and validate the document each session " +
      "leaves behind."
  },
  {
    id: "electron-shell",
    title: "Electron shell (windows, IPC, menus, auto-update)",
    harnesses: [],
    gap:
      "Covered by Jest unit tests only. A harness would boot the packaged " +
      "shell headlessly (Playwright's Electron driver), assert the " +
      "IPC surface, and reuse backend-smoke for the server half."
  }
];

export interface HarnessAuditResult {
  surfaces: Array<{
    id: string;
    title: string;
    harnesses: string[];
    covered: boolean;
    gap?: string;
  }>;
  coveredCount: number;
  gapCount: number;
  /** Surface entries with no harness and no gap note — always a defect. */
  undocumentedGaps: string[];
  /** Harness ids referenced by a surface but missing from HARNESSES. */
  unknownHarnessRefs: string[];
  /** Harness ids no surface references. */
  orphanHarnesses: string[];
}

export function auditHarnessCoverage(
  harnesses: HarnessEntry[] = HARNESSES,
  surfaces: SurfaceEntry[] = SURFACES
): HarnessAuditResult {
  const known = new Set(harnesses.map((h) => h.id));
  const referenced = new Set<string>();
  const unknownHarnessRefs: string[] = [];
  const undocumentedGaps: string[] = [];

  const rows = surfaces.map((s) => {
    for (const id of s.harnesses) {
      referenced.add(id);
      if (!known.has(id)) unknownHarnessRefs.push(`${s.id} → ${id}`);
    }
    const covered = s.harnesses.length > 0;
    if (!covered && !s.gap) undocumentedGaps.push(s.id);
    return {
      id: s.id,
      title: s.title,
      harnesses: s.harnesses,
      covered,
      ...(s.gap && { gap: s.gap })
    };
  });

  return {
    surfaces: rows,
    coveredCount: rows.filter((r) => r.covered).length,
    gapCount: rows.filter((r) => !r.covered).length,
    undocumentedGaps,
    unknownHarnessRefs,
    orphanHarnesses: harnesses
      .map((h) => h.id)
      .filter((id) => !referenced.has(id) && id !== "harness-audit" && id !== "affected")
  };
}
