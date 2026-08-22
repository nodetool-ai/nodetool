/**
 * The harness registry — the machine-readable inventory behind
 * harness-first engineering (docs/HARNESS_FIRST.md).
 *
 * Two lists, one invariant:
 *
 *  - HARNESSES: every headless, agent-drivable way to exercise a NodeTool
 *    surface — validate it, run it, replay interactions against it, or score
 *    a model driving it. A harness with a `selfcheck` can prove its surface
 *    still works with no target, no key, and no human: that's what
 *    `nodetool harness gate` runs.
 *  - SURFACES: every product surface a user (or agent) can touch. Each names
 *    the harnesses that cover it and the code paths that belong to it, or
 *    carries a `gap` note saying why nothing covers it yet and what a
 *    harness for it would look like.
 *
 * The invariant — no surface without a harness or a documented gap — is
 * enforced two ways: `nodetool harness audit` reports it (exit 1 with
 * `--strict` on any gap), and tests/harness-registry.test.ts fails the build
 * on an undocumented one. Shipping a new surface means adding it here, which
 * means either pointing at its harness or writing down the debt.
 *
 * The `paths` on each surface are what make the registry executable:
 * `nodetool harness gate` maps a diff onto surfaces by path prefix and runs
 * the selfchecks of every harness covering a touched surface. The gate — not
 * the author — selects the checks.
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

interface HarnessSelfcheck {
  /** Keyless, deterministic, target-free invocation from the repo root. */
  command: string;
  /**
   * "cheap" runs in the default gate; "expensive" (multi-minute: bundle
   * staging, image builds) needs `--expensive`.
   */
  cost: "cheap" | "expensive";
}

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
  /**
   * How the gate exercises this harness without a target. Absent when every
   * invocation needs a target, a key, or a model (the gate then lists the
   * harness as "manual" for its touched surfaces).
   */
  selfcheck?: HarnessSelfcheck;
}

export interface SurfaceEntry {
  id: string;
  title: string;
  /** Harness ids that cover this surface. */
  harnesses: string[];
  /**
   * Repo-relative path prefixes owned by this surface. A changed file
   * matching any prefix means the diff touches the surface. Overlaps are
   * fine — one file can touch several surfaces.
   */
  paths: string[];
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
    capabilities: ["json", "no-db", "gated"],
    agentTool: "validate_workflow",
    docs: "AGENTS.md § nodetool validate",
    selfcheck: { command: "npm run validate:examples", cost: "cheap" }
  },
  {
    id: "debug",
    title: "Workflow debug harness (server + browser surfaces)",
    command: "nodetool debug <id|file> [--browser --trace --watch --supervise]",
    kind: "execution",
    capabilities: ["json", "watch", "supervise", "browser", "gated"],
    agentTool: "debug_workflow",
    docs: "AGENTS.md § nodetool debug"
  },
  {
    id: "reliability-ring0",
    title: "Reliability Ring 0 (golden journeys on the kernel, strict lifecycle)",
    command: "npm run reliability:ring0",
    kind: "execution",
    capabilities: ["gated"],
    docs: "docs/RELIABILITY_ARCHITECTURE.md",
    selfcheck: { command: "npm run reliability:ring0", cost: "cheap" }
  },
  {
    id: "node-run",
    title: "Single-node harness",
    command: "nodetool node run <type> --props '{...}' [--no-secrets]",
    kind: "execution",
    capabilities: ["json", "no-db"],
    docs: "AGENTS.md § nodetool node run",
    selfcheck: {
      command:
        "npm run dev:nodetool -- node run nodetool.text.Concat --props '{\"a\":\"harness-\",\"b\":\"gate\"}' --no-secrets",
      cost: "cheap"
    }
  },
  {
    id: "dsl-native-flow",
    title: "Native flow (call a node as a function, host backend + guest surface)",
    // No CLI command owns it: the public surface is the sandbox pack
    // @nodetool-ai/sandbox-flow, and the host side is internal to
    // packages/dsl. The checked-in suites are the headless surface — they call
    // nodes on the flow's own invoke path, stream both directions, and abort
    // mid-call, with no key, no database, and no server.
    command:
      "npm run test --workspace=packages/dsl -- flow-core flow-streaming flow-abort",
    kind: "execution",
    capabilities: ["no-db"],
    docs: "docs/dsl-native-flow-design.md",
    selfcheck: {
      command:
        "npm run test --workspace=packages/dsl -- flow-core flow-streaming flow-abort",
      cost: "cheap"
    }
  },
  {
    id: "app-debug",
    title: "Mini-app debug harness",
    command: "nodetool app debug <id|bundle.json> [--interact ... --no-run]",
    kind: "execution",
    capabilities: ["json", "interact", "no-db"],
    docs: "AGENTS.md § nodetool app debug",
    selfcheck: {
      command:
        "npm run dev:nodetool -- app debug packages/base-nodes/nodetool/examples/apps/ask-your-documents.app.json --no-run",
      cost: "cheap"
    }
  },
  {
    id: "app-build",
    title: "Mini-app build harness (spec→plan→author→check→run→judge)",
    command: "nodetool app build <prompt|spec.json> -p <provider> -m <model>",
    kind: "execution",
    capabilities: ["json", "watch", "supervise", "gated"],
    docs: "AGENTS.md § nodetool app build",
    selfcheck: {
      // The suite's two deterministic cases: scripted author, real kernel,
      // provider constructed but never called — the same invocation the
      // Quality Gate's app-build leg runs.
      command:
        "npm run dev:nodetool -- eval app-build --cases greeting-card,draft-then-publish -p ollama -m none --no-find-model --min-success 1",
      cost: "cheap"
    }
  },
  {
    id: "timeline-validate",
    title: "Timeline static check",
    command: "nodetool timeline validate <id|file.json>",
    kind: "static",
    capabilities: ["json", "no-db"],
    agentTool: "validate_timeline",
    docs: "AGENTS.md § nodetool timeline validate / debug"
  },
  {
    id: "timeline-debug",
    title: "Timeline edit-session replay",
    command: "nodetool timeline debug <id|file.json> --interact '[...]'",
    kind: "execution",
    capabilities: ["json", "interact", "no-db"],
    docs: "AGENTS.md § nodetool timeline validate / debug"
  },
  {
    id: "timeline-versions",
    title: "Timeline version history (snapshot, restore, validate the restore)",
    command:
      "nodetool timeline versions list|show|create|restore|delete <id> [<version>]",
    kind: "execution",
    capabilities: ["json"],
    agentTool: "restore_timeline_version",
    docs: "AGENTS.md § nodetool timeline versions"
  },
  {
    id: "sketch-validate",
    title: "Sketch static check",
    command: "nodetool sketch validate <id|file.json>",
    kind: "static",
    capabilities: ["json", "no-db"],
    agentTool: "validate_sketch",
    docs: "AGENTS.md § nodetool sketch validate / debug"
  },
  {
    id: "sketch-debug",
    title: "Sketch edit-session replay",
    command: "nodetool sketch debug <id|file.json> --interact '[...]'",
    kind: "execution",
    capabilities: ["json", "interact", "no-db"],
    docs: "AGENTS.md § nodetool sketch validate / debug"
  },
  {
    id: "sketch-versions",
    title: "Sketch version history (snapshot, restore, validate the restore)",
    command:
      "nodetool sketch versions list|show|create|restore|delete <id> [<version>]",
    kind: "execution",
    capabilities: ["json"],
    agentTool: "restore_sketch_version",
    docs: "AGENTS.md § nodetool sketch versions"
  },
  {
    id: "jsscript-validate",
    title: "JS script static check",
    command: "nodetool jsscript validate <id|file.json>",
    kind: "static",
    capabilities: ["json", "no-db"],
    agentTool: "validate_js_script",
    docs: "AGENTS.md § nodetool jsscript"
  },
  {
    id: "jsscript-run",
    title: "JS script single run (QuickJS sandbox)",
    command: "nodetool jsscript run <id|file.json> --inputs '{...}'",
    kind: "execution",
    capabilities: ["json", "no-db"],
    agentTool: "run_js_script",
    docs: "AGENTS.md § nodetool jsscript"
  },
  {
    id: "jsscript-test",
    title: "JS script saved-case regression run",
    command: "nodetool jsscript test <id|file.json>",
    kind: "execution",
    capabilities: ["json", "no-db"],
    agentTool: "test_js_script",
    docs: "AGENTS.md § nodetool jsscript",
    selfcheck: {
      // Two checked-in fixtures with deterministic cases: no network, no
      // secrets, no database. One sums a buffered list input; the other reads
      // the numbers off `stream` from items the cases stage.
      command:
        "npm run dev:nodetool -- jsscript test packages/cli/tests/fixtures/js-script-sum.json && " +
        "npm run dev:nodetool -- jsscript test packages/cli/tests/fixtures/js-script-running-total.json",
      cost: "cheap"
    }
  },
  {
    id: "jsscript-debug",
    title: "JS script edit-session replay",
    command: "nodetool jsscript debug <id|file.json> --interact '[...]'",
    kind: "execution",
    capabilities: ["json", "interact", "no-db"],
    docs: "AGENTS.md § nodetool jsscript"
  },
  {
    id: "jsscript-versions",
    title:
      "JS script version history (snapshot, restore, validate the restore)",
    command:
      "nodetool jsscript versions list|show|create|restore|delete <id> [<version>]",
    kind: "execution",
    capabilities: ["json"],
    docs: "AGENTS.md § nodetool jsscript"
  },
  {
    id: "eval",
    title:
      "Agent evaluation suites (graph-planner, graph-e2e, code-gen, task-planner, subtask, codeact, tool-loop×8, app-build)",
    command: "nodetool eval <suite> -p <provider> -m <model> [--min-success N]",
    kind: "eval",
    capabilities: ["json", "gated"],
    docs: "packages/agents/AGENTS.md"
  },
  {
    id: "chat-stdin",
    title: "Headless chat agent (piped stdin)",
    command: 'echo "<prompt>" | nodetool-chat -p <provider> -m <model>',
    kind: "execution",
    capabilities: [],
    docs: "AGENTS.md § nodetool chat"
  },
  {
    id: "telegram-bridge",
    title: "Telegram messaging bridge (renderer, router, identity, adapter)",
    command: "nodetool telegram serve",
    kind: "execution",
    capabilities: ["no-db"],
    docs: "docs/telegram-bot-design.md",
    selfcheck: {
      // The bridge suites are hermetic (fake Bot API, fake socket, injected
      // clock) and include the dependency-cone test; the websocket files run
      // the identity routes, the shared link-code store, and the tRPC router.
      command:
        "npm run test --workspace=packages/telegram && npx vitest run tests/integrations-routes.test.ts tests/link-codes.test.ts tests/trpc-integrations.test.ts --root packages/websocket",
      cost: "cheap"
    }
  },
  {
    id: "backend-smoke",
    title: "Packaged-backend smoke (bundle staging + /health boot)",
    command: "npm run backend:smoke",
    kind: "meta",
    capabilities: ["gated"],
    docs: "AGENTS.md § Common Pitfalls (bundle-backend)",
    selfcheck: { command: "npm run backend:smoke", cost: "expensive" }
  },
  {
    id: "docker-smoke",
    title: "Deploy-image smoke (build, boot, load app in a browser)",
    command: "node scripts/docker-smoke.mjs http://localhost:7777",
    kind: "meta",
    capabilities: ["browser", "gated"],
    docs: "AGENTS.md § Common Pitfalls (deploy)"
  },
  {
    id: "provider-contract",
    title:
      "Provider contract probes (raw response fixtures + one live request per provider)",
    command: "npm run probe:providers [--json] [--out report.json]",
    kind: "meta",
    capabilities: ["json", "gated"],
    docs: "docs/provider-contract-probes.md",
    selfcheck: {
      // The offline half: every manifest entry decodes its checked-in raw
      // response, and every declared required field is removed once to prove
      // the check can fail. No key, no network.
      command:
        "npm run test --workspace=packages/runtime -- provider-contract-probes",
      cost: "cheap"
    }
  },
  {
    id: "affected",
    title: "Changed-file → workspace mapping",
    command: "nodetool affected [--base main]",
    kind: "meta",
    capabilities: ["json", "no-db"],
    docs: "AGENTS.md § nodetool affected"
  },
  {
    id: "packs-compile",
    title: "Sandbox npm module compiler (bundle, scan, probe, cache) and the shipped bridge packs",
    command: "nodetool packs compile [--json] [--force]",
    kind: "static",
    capabilities: ["json", "no-db"],
    docs: "docs/sandbox-package-design.md § Config-only modules from npm packages",
    selfcheck: {
      command: "npm run test --workspace=packages/sandbox-compiler",
      cost: "cheap"
    }
  },
  {
    id: "script-storyboard-link",
    title:
      "Script ↔ storyboard link (extract, scaffold, joint assemble, link validation)",
    // No CLI command owns the link: it is pure functions in protocol and
    // timeline plus the tools that call them. The checked-in suites are the
    // headless surface — they build a linked document and hand the assembled
    // timeline to the same validator `nodetool timeline validate` runs.
    command:
      "npm run test --workspace=packages/protocol -- script-link && " +
      "npm run test --workspace=packages/timeline -- script-link linked && " +
      "npm run test --workspace=packages/execution -- linked-timeline-validate",
    kind: "static",
    capabilities: ["no-db"],
    docs: "docs/script-storyboard-link/design.md § 6",
    selfcheck: {
      command:
        "npm run test --workspace=packages/protocol -- script-link && " +
        "npm run test --workspace=packages/timeline -- script-link linked && " +
        "npm run test --workspace=packages/execution -- linked-timeline-validate",
      cost: "cheap"
    }
  },
  {
    id: "harness-audit",
    title: "Harness coverage audit (this registry)",
    command: "nodetool harness audit [--strict]",
    kind: "meta",
    capabilities: ["json", "no-db", "gated"],
    docs: "docs/HARNESS_FIRST.md",
    selfcheck: {
      command: "npm run dev:nodetool -- harness audit",
      cost: "cheap"
    }
  }
];

export const SURFACES: SurfaceEntry[] = [
  {
    id: "telegram-bridge",
    title: "Telegram bot bridge + messaging-integration identity",
    harnesses: ["telegram-bridge"],
    paths: [
      "packages/telegram/",
      "packages/websocket/src/routes/integrations.ts",
      "packages/websocket/src/lib/link-codes.ts",
      "packages/websocket/src/trpc/routers/integrations.ts",
      "packages/auth/src/providers/delegated-token-provider.ts",
      "packages/models/src/external-identity.ts"
    ]
  },
  {
    id: "workflow-execution",
    title: "Workflow execution (kernel runner)",
    harnesses: ["validate", "debug", "node-run", "reliability-ring0"],
    paths: [
      "packages/protocol/",
      "packages/kernel/",
      "packages/execution/",
      "packages/runtime/",
      "packages/node-sdk/",
      "packages/base-nodes/",
      "reliability/",
      // The CLI-facing example graphs. `npm run validate:examples` scans them,
      // so a diff that edits one runs the validate selfcheck.
      "examples/workflows/"
    ]
  },
  {
    id: "provider-clients",
    title: "LLM and media provider clients (request shaping + response decoding)",
    harnesses: ["provider-contract", "eval"],
    paths: ["packages/runtime/src/providers/"]
  },
  {
    id: "workflow-authoring",
    title: "Workflow authoring (planners + ui_* graph tools)",
    harnesses: ["validate", "eval"],
    paths: ["packages/agents/", "packages/dsl/"]
  },
  {
    id: "dsl-native-flow",
    title: "Native flow (typed node calls from guest code)",
    harnesses: ["dsl-native-flow", "packs-compile"],
    paths: [
      "packages/dsl/src/flow/",
      "packages/agents/src/capabilities/flow.ts",
      "packages/agents/src/capabilities/flow.specs.ts",
      "packages/sandbox-packs/sandbox-flow/"
    ]
  },
  {
    id: "mini-apps",
    title: "Mini apps (documents, bindings, operations)",
    harnesses: ["app-debug", "app-build", "eval"],
    paths: [
      "packages/app-runtime/",
      "packages/agents/src/app-build/",
      "packages/execution/src/app-debug/",
      "packages/base-nodes/nodetool/examples/apps/"
    ]
  },
  {
    id: "timeline",
    title: "Timeline sequences (ui_timeline_* tools, version history)",
    harnesses: [
      "timeline-validate",
      "timeline-debug",
      "timeline-versions",
      "eval"
    ],
    paths: [
      "packages/timeline/",
      "packages/execution/src/timeline-debug/",
      "packages/cli/src/timeline-debug/",
      "packages/cli/src/commands/timeline-versions.ts",
      "packages/agents/src/tools/timeline-version-tools.ts",
      "packages/models/src/timeline-sequence-version.ts",
      "packages/websocket/src/trpc/routers/timeline.ts"
    ]
  },
  {
    id: "sketch",
    title: "Sketches (image documents, ui_sketch_* tools, version history)",
    harnesses: ["sketch-validate", "sketch-debug", "sketch-versions", "eval"],
    paths: [
      "packages/execution/src/sketch-debug/",
      "packages/cli/src/sketch-debug/",
      "packages/cli/src/commands/sketch-versions.ts",
      "packages/cli/src/commands/sketch.ts",
      "packages/agents/src/tools/sketch-version-tools.ts",
      "packages/models/src/image-document-version.ts",
      "packages/websocket/src/trpc/routers/sketch.ts"
    ]
  },
  {
    id: "jsscript",
    title: "JS scripts (documents, ui_jsscript_* tools, version history)",
    harnesses: [
      "jsscript-validate",
      "jsscript-run",
      "jsscript-test",
      "jsscript-debug",
      "jsscript-versions",
      "eval"
    ],
    paths: [
      "packages/execution/src/js-script-debug/",
      "packages/cli/src/js-script-debug/",
      "packages/cli/src/commands/js-script.ts",
      "packages/cli/src/commands/js-script-versions.ts",
      "packages/cli/src/commands/js-script-validation-output.ts",
      "packages/agents/src/capabilities/js-scripts.ts",
      "packages/agents/src/capabilities/js-scripts.specs.ts",
      "packages/agents/src/evals/surfaces/js-script.ts",
      "packages/models/src/js-script.ts",
      "packages/models/src/js-script-version.ts",
      "packages/protocol/src/api-schemas/js-scripts.ts",
      "packages/websocket/src/trpc/routers/js-scripts.ts",
      "packages/websocket/src/routes/js-scripts.ts"
    ]
  },
  {
    id: "storyboard",
    title:
      "Storyboards (shots, keyframes, clips, ui_storyboard_* tools, script link)",
    harnesses: ["script-storyboard-link", "timeline-validate", "eval"],
    paths: [
      "packages/protocol/src/script-link.ts",
      "packages/protocol/src/api-schemas/storyboards.ts",
      "packages/timeline/src/storyboard.ts",
      "packages/timeline/src/script-link.ts",
      "packages/timeline/src/linked.ts",
      "packages/agents/src/capabilities/storyboards.ts",
      "packages/agents/src/capabilities/storyboards.specs.ts",
      "packages/agents/src/tools/storyboard-render-tools.ts",
      "packages/agents/src/evals/surfaces/storyboard.ts",
      "packages/agents/src/evals/surfaces/creative-pipeline.ts",
      "packages/models/src/schema/storyboards.ts",
      "packages/websocket/src/trpc/routers/storyboards.ts",
      "web/src/components/storyboard/",
      "web/src/lib/tools/builtin/storyboard.ts",
      "web/src/studio/"
    ]
  },
  {
    id: "script",
    title: "Scripts (lines, cast, voicing, ui_script_* tools, storyboard link)",
    harnesses: ["script-storyboard-link", "timeline-validate", "eval"],
    paths: [
      "packages/protocol/src/script-link.ts",
      "packages/protocol/src/api-schemas/scripts.ts",
      "packages/timeline/src/script.ts",
      "packages/timeline/src/script-link.ts",
      "packages/timeline/src/linked.ts",
      "packages/agents/src/capabilities/scripts.ts",
      "packages/agents/src/capabilities/scripts.specs.ts",
      "packages/agents/src/tools/script-voice-tools.ts",
      "packages/agents/src/evals/surfaces/script.ts",
      "packages/agents/src/evals/surfaces/creative-pipeline.ts",
      "packages/models/src/schema/scripts.ts",
      "packages/websocket/src/trpc/routers/scripts.ts",
      "web/src/components/script/",
      "web/src/lib/tools/builtin/script.ts",
      "web/src/studio/"
    ]
  },
  {
    id: "sandbox-packages",
    title: "Sandbox packages (guest modules, host modules, npm compilation, catalog)",
    harnesses: ["packs-compile", "validate"],
    paths: [
      "packages/sandbox-compiler/",
      "packages/sandbox-packs/",
      "packages/agents/src/host-modules/",
      "packages/protocol/src/sandbox-host.ts",
      "packages/node-sdk/src/sandbox-bridge-packs.ts",
      "packages/node-sdk/src/sandbox-pack-discovery.ts",
      "packages/node-sdk/src/sandbox-module-catalog.ts",
      "packages/node-sdk/src/sandbox-catalog-host.ts",
      "packages/node-sdk/src/sandbox-npm-artifacts.ts",
      "packages/protocol/src/sandbox-package.ts",
      "packages/websocket/src/sandbox-catalog.ts",
      "electron/src/nodePackManager.ts"
    ]
  },
  {
    id: "chat-agent",
    title: "Chat agent loop (unified tool-calling loop)",
    harnesses: ["chat-stdin", "eval"],
    paths: ["packages/chat/", "packages/cli/"]
  },
  {
    id: "web-editor",
    title: "Web editor (graph canvas, run rendering)",
    harnesses: ["debug", "docker-smoke"],
    paths: ["web/"]
  },
  {
    id: "desktop-backend",
    title: "Packaged Electron backend (bundled server.mjs)",
    harnesses: ["backend-smoke"],
    paths: [
      "scripts/bundle-backend.mjs",
      "scripts/verify-backend-bundle.mjs",
      "packages/config/src/package-asset-registry.ts"
    ]
  },
  {
    id: "deploy-image",
    title: "Deployed GHCR image (Fly.io / self-hosted)",
    harnesses: ["docker-smoke"],
    paths: [
      "Dockerfile",
      "docker-compose.yml",
      "fly.toml",
      "scripts/docker-smoke.mjs"
    ]
  },
  {
    id: "mobile",
    title: "Mobile app (documents via chat agent ui_* tools)",
    harnesses: [],
    paths: ["mobile/"],
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
    paths: ["electron/"],
    gap:
      "Covered by Jest unit tests only. A harness would boot the packaged " +
      "shell headlessly (Playwright's Electron driver), assert the " +
      "IPC surface, and reuse backend-smoke for the server half."
  }
];

interface HarnessAuditResult {
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
      .filter(
        (id) => !referenced.has(id) && id !== "harness-audit" && id !== "affected"
      )
  };
}

// ---------------------------------------------------------------------------
// The gate: diff → touched surfaces → selfchecks to run.
// ---------------------------------------------------------------------------

interface GateCheck {
  harnessId: string;
  command: string;
  cost: "cheap" | "expensive";
  /** Touched surfaces this check verifies. */
  surfaces: string[];
}

export interface GatePlan {
  changedFiles: string[];
  /** Touched surfaces with the files that touched them. */
  surfaces: Array<{ id: string; files: string[] }>;
  /** Deduped selfchecks for every harness covering a touched surface. */
  checks: GateCheck[];
  /**
   * Harnesses covering touched surfaces that have no selfcheck — they need a
   * target, key, or model, so the gate can only name them, not run them.
   */
  manual: Array<{ harnessId: string; command: string; surfaces: string[] }>;
  /** Touched surfaces with no harness at all (documented gaps). */
  uncoveredSurfaces: string[];
  /** Changed files no surface claims. */
  unmappedFiles: string[];
}

export function planGate(
  changedFiles: string[],
  harnesses: HarnessEntry[] = HARNESSES,
  surfaces: SurfaceEntry[] = SURFACES
): GatePlan {
  const byId = new Map(harnesses.map((h) => [h.id, h]));
  const touched = new Map<string, string[]>();
  const unmappedFiles: string[] = [];

  for (const file of changedFiles) {
    let matched = false;
    for (const s of surfaces) {
      if (s.paths.some((p) => file === p || file.startsWith(p))) {
        matched = true;
        const files = touched.get(s.id) ?? [];
        files.push(file);
        touched.set(s.id, files);
      }
    }
    if (!matched) unmappedFiles.push(file);
  }

  const checkByHarness = new Map<string, GateCheck>();
  const manualByHarness = new Map<
    string,
    { harnessId: string; command: string; surfaces: string[] }
  >();
  const uncoveredSurfaces: string[] = [];

  for (const s of surfaces) {
    if (!touched.has(s.id)) continue;
    if (s.harnesses.length === 0) {
      uncoveredSurfaces.push(s.id);
      continue;
    }
    for (const id of s.harnesses) {
      const h = byId.get(id);
      if (!h) continue;
      if (h.selfcheck) {
        const existing = checkByHarness.get(id);
        if (existing) {
          existing.surfaces.push(s.id);
        } else {
          checkByHarness.set(id, {
            harnessId: id,
            command: h.selfcheck.command,
            cost: h.selfcheck.cost,
            surfaces: [s.id]
          });
        }
      } else {
        const existing = manualByHarness.get(id);
        if (existing) {
          existing.surfaces.push(s.id);
        } else {
          manualByHarness.set(id, {
            harnessId: id,
            command: h.command,
            surfaces: [s.id]
          });
        }
      }
    }
  }

  return {
    changedFiles,
    surfaces: [...touched.entries()].map(([id, files]) => ({ id, files })),
    checks: [...checkByHarness.values()],
    manual: [...manualByHarness.values()],
    uncoveredSurfaces,
    unmappedFiles
  };
}
