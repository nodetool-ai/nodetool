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
  | "gated:pr" // wired into CI as a pass/fail gate on every pull request
  | "gated:nightly"; // wired into CI as a pass/fail gate on a nightly schedule only

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
    capabilities: ["json", "no-db", "gated:pr"],
    agentTool: "validate_workflow",
    docs: "docs/harnesses.md § nodetool validate",
    selfcheck: { command: "npm run validate:examples", cost: "cheap" }
  },
  {
    id: "debug",
    title: "Workflow debug harness (server + browser surfaces)",
    command: "nodetool debug <id|file> [--browser --trace --watch --supervise]",
    kind: "execution",
    capabilities: ["json", "watch", "supervise", "browser", "gated:nightly"],
    agentTool: "debug_workflow",
    docs: "docs/harnesses.md § nodetool debug",
    selfcheck: { command: "npm run examples:smoke", cost: "expensive" }
  },
  {
    id: "reliability-ring0",
    title: "Reliability Ring 0 (golden journeys on the kernel, strict lifecycle)",
    command: "npm run reliability:ring0",
    kind: "execution",
    capabilities: ["gated:pr"],
    docs: "docs/harnesses.md § nodetool reliability",
    selfcheck: { command: "npm run reliability:ring0", cost: "cheap" }
  },
  {
    id: "node-run",
    title: "Single-node harness",
    command: "nodetool node run <type> --props '{...}' [--no-secrets]",
    kind: "execution",
    capabilities: ["json", "no-db"],
    docs: "docs/harnesses.md § nodetool node run",
    selfcheck: {
      command:
        "npm run dev:nodetool -- node run nodetool.text.Concat --props '{\"a\":\"harness-\",\"b\":\"gate\"}' --no-secrets",
      cost: "cheap"
    }
  },
  {
    id: "blender",
    title: "Blender headless render (nodetool.blender.* nodes)",
    command: "nodetool node run nodetool.blender.RenderImage --props '<fixture>'",
    kind: "execution",
    capabilities: ["json", "no-db"],
    docs: "docs/blender-headless-integration-design.md",
    selfcheck: {
      // Renders the checked-in triangle fixture through the real Blender.
      // Expensive on purpose: Blender startup plus a render, and it needs
      // the Blender binary, so the default gate skips it without --expensive.
      command:
        "npm run dev:nodetool -- node run nodetool.blender.RenderImage --props \"$(cat packages/blender-nodes/tests/fixtures/render-image-props.json)\" --no-secrets",
      cost: "expensive"
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
    docs: "docs/harnesses.md § nodetool app debug",
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
    capabilities: ["json", "watch", "supervise", "gated:pr"],
    docs: "docs/harnesses.md § nodetool app build",
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
    docs: "docs/harnesses.md § nodetool timeline validate / debug"
  },
  {
    id: "timeline-debug",
    title: "Timeline edit-session replay",
    command: "nodetool timeline debug <id|file.json> --interact '[...]'",
    kind: "execution",
    capabilities: ["json", "interact", "no-db"],
    docs: "docs/harnesses.md § nodetool timeline validate / debug"
  },
  {
    id: "timeline-versions",
    title: "Timeline version history (snapshot, restore, validate the restore)",
    command:
      "nodetool timeline versions list|show|create|restore|delete <id> [<version>]",
    kind: "execution",
    capabilities: ["json"],
    agentTool: "restore_timeline_version",
    docs: "docs/harnesses.md § nodetool timeline versions"
  },
  {
    id: "sketch-validate",
    title: "Sketch static check",
    command: "nodetool sketch validate <id|file.json>",
    kind: "static",
    capabilities: ["json", "no-db"],
    agentTool: "validate_sketch",
    docs: "docs/harnesses.md § nodetool sketch validate / debug"
  },
  {
    id: "sketch-debug",
    title: "Sketch edit-session replay",
    command: "nodetool sketch debug <id|file.json> --interact '[...]'",
    kind: "execution",
    capabilities: ["json", "interact", "no-db"],
    docs: "docs/harnesses.md § nodetool sketch validate / debug"
  },
  {
    id: "sketch-versions",
    title: "Sketch version history (snapshot, restore, validate the restore)",
    command:
      "nodetool sketch versions list|show|create|restore|delete <id> [<version>]",
    kind: "execution",
    capabilities: ["json"],
    agentTool: "restore_sketch_version",
    docs: "docs/harnesses.md § nodetool sketch versions"
  },
  {
    id: "jsscript-validate",
    title: "JS script static check",
    command: "nodetool jsscript validate <id|file.json>",
    kind: "static",
    capabilities: ["json", "no-db"],
    agentTool: "validate_js_script",
    docs: "docs/harnesses.md § nodetool jsscript"
  },
  {
    id: "jsscript-run",
    title: "JS script single run (QuickJS sandbox)",
    command: "nodetool jsscript run <id|file.json> --inputs '{...}'",
    kind: "execution",
    capabilities: ["json", "no-db"],
    agentTool: "run_js_script",
    docs: "docs/harnesses.md § nodetool jsscript"
  },
  {
    id: "jsscript-test",
    title: "JS script saved-case regression run",
    command: "nodetool jsscript test <id|file.json>",
    kind: "execution",
    capabilities: ["json", "no-db"],
    agentTool: "test_js_script",
    docs: "docs/harnesses.md § nodetool jsscript",
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
    docs: "docs/harnesses.md § nodetool jsscript"
  },
  {
    id: "jsscript-versions",
    title:
      "JS script version history (snapshot, restore, validate the restore)",
    command:
      "nodetool jsscript versions list|show|create|restore|delete <id> [<version>]",
    kind: "execution",
    capabilities: ["json"],
    docs: "docs/harnesses.md § nodetool jsscript"
  },
  {
    id: "eval",
    title:
      "Agent evaluation suites (graph-planner, graph-e2e, code-gen, task-planner, subtask, codeact, tool-loop variants, app-build)",
    command: "nodetool eval <suite> -p <provider> -m <model> [--min-success N]",
    kind: "eval",
    // workflow_dispatch only (.github/workflows/agent-eval.yml) — no PR or
    // schedule trigger, so this is not a `gated:*` harness.
    capabilities: ["json"],
    docs: "packages/agents/AGENTS.md"
  },
  {
    id: "chat-stdin",
    title: "Headless chat agent (piped stdin)",
    command: 'echo "<prompt>" | nodetool-chat -p <provider> -m <model>',
    kind: "execution",
    capabilities: [],
    docs: "docs/harnesses.md § nodetool chat"
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
    capabilities: ["gated:pr"],
    docs: "AGENTS.md § Common Pitfalls",
    selfcheck: { command: "npm run backend:smoke", cost: "expensive" }
  },
  {
    id: "docker-smoke",
    title: "Deploy-image smoke (build, boot, load app in a browser)",
    command: "node scripts/docker-smoke.mjs http://localhost:7777",
    kind: "meta",
    capabilities: ["browser", "gated:pr"],
    docs: "AGENTS.md § Common Pitfalls"
  },
  {
    id: "provider-contract",
    title:
      "Provider contract probes (raw response fixtures + one live request per provider)",
    command: "npm run probe:providers [--json] [--out report.json]",
    kind: "meta",
    // Nightly-only (.github/workflows/provider-contract-probe.yml: schedule +
    // workflow_dispatch, no pull_request) — the offline selfcheck below is
    // exercised there, not on every PR.
    capabilities: ["json", "gated:nightly"],
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
    docs: "docs/harnesses.md § nodetool affected"
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
    id: "capability-suites",
    title: "Agent capability suites (per-capability contract tests)",
    // No CLI command owns a capability: the surface is the wire name a guest
    // or a model calls. The checked-in suites are the headless surface, and
    // `packages/cli/src/harness/capability-table.ts` says which suite covers
    // which capability — the audit fails on one that names none.
    command:
      "npm run test --workspace=packages/agents -- capabilities capability " +
      "mcp-tools memory-tools workflow-version-tools nodetool-api-workflows " +
      "sandbox-package-docs sandbox-package-listing browser-tools " +
      "timelines-op-input",
    kind: "static",
    // Runs in CI as part of the whole-package `--filter=@nodetool-ai/agents`
    // leg, but no workflow names this filtered command specifically, so it
    // is not a `gated:*` harness by the substring-in-a-workflow rule.
    capabilities: ["no-db"],
    docs: "packages/agents/AGENTS.md § Capability coverage",
    selfcheck: {
      // `capabilities:check` re-derives the table from the live registry, so
      // a capability added without a mapping fails here rather than in review.
      command:
        "npm run capabilities:check && " +
        "npm run test --workspace=packages/agents -- capabilities capability " +
        "mcp-tools memory-tools workflow-version-tools nodetool-api-workflows " +
        "sandbox-package-docs sandbox-package-listing browser-tools " +
        "timelines-op-input",
      cost: "cheap"
    }
  },
  {
    id: "jtbd",
    title: "Jobs to be done (end-to-end agent jobs, recorded for review)",
    command:
      "nodetool jtbd <list|run|optimize> [-p <provider> -m <model>]",
    kind: "eval",
    capabilities: ["json"],
    docs: "docs/harnesses.md § nodetool jtbd",
    selfcheck: {
      // Keyless: the catalogue's own invariants (every job states a purpose,
      // grades an outcome, and fails its checks on an untouched world) plus
      // the transcript capture the review step reads. No model is called.
      command:
        "npm run test --workspace=packages/agents -- jtbd-friction jtbd-transcript",
      cost: "cheap"
    }
  },
  {
    id: "provider-codegen",
    title: "Generated provider metadata drift (FAL and KIE fixture mode)",
    command:
      "npm run generate:fal:check && npm run generate:kie:check",
    kind: "static",
    capabilities: ["json", "no-db", "gated:pr"],
    docs: "AGENTS.md § Common Pitfalls",
    selfcheck: {
      command:
        "npm run generate:fal:check -- --strict && " +
        "npm run generate:kie:check -- --strict",
      cost: "cheap"
    }
  },
  {
    id: "recipes",
    title: "Recipe chains (shipped manifests, the app listing, the site pages)",
    // A recipe names shipped example workflows and stores no graph, so what
    // rots is a step whose example was renamed: the app drops the recipe from
    // its Examples listing and the site's page loses a workflow. Both readers
    // are checked — the resolver the app calls, and the generator the site
    // builds its pages and bundles with.
    command: "npx tsx marketing/scripts/generate-recipes.mjs --check",
    kind: "static",
    capabilities: ["no-db", "gated:pr"],
    docs: "docs/harnesses.md § Shipped recipes",
    selfcheck: {
      command:
        "npm run test --workspace=packages/websocket -- example-recipes && " +
        "npx tsx marketing/scripts/generate-recipes.mjs --check",
      cost: "cheap"
    }
  },
  {
    id: "repo-scripts",
    title: "Repo tooling scripts (test selection, validators, generators)",
    // The scripts a contributor and CI run from the repo root. Their pure
    // logic (test-affected's plan builder, the validators' rules) is pinned
    // by the suites under scripts/__tests__; a script with no suite is
    // covered only by the CI leg that runs it.
    command: "npm run test:scripts",
    kind: "meta",
    capabilities: ["json", "no-db"],
    docs: "AGENTS.md § Build, Lint & Test Commands",
    selfcheck: { command: "npm run test:scripts", cost: "cheap" }
  },
  {
    id: "harness-audit",
    title: "Harness coverage audit (this registry)",
    command: "nodetool harness audit [--strict]",
    kind: "meta",
    // Not run by name in any workflow today (the invariant it checks is
    // enforced by the registry test below, in the normal test:packages leg),
    // so it carries no `gated:*` tag under the substring-in-a-workflow rule.
    capabilities: ["json", "no-db"],
    docs: "docs/HARNESS_FIRST.md",
    selfcheck: {
      command:
        "npm run dev:nodetool -- harness audit && " +
        "npx vitest run tests/harness-registry.test.ts --root packages/cli",
      cost: "cheap"
    }
  },
  {
    id: "api-routes",
    title: "API server routes (Fastify HTTP + WebSocket)",
    command: "nodetool serve",
    kind: "execution",
    capabilities: ["no-db"],
    docs: "docs/harnesses.md § nodetool serve",
    selfcheck: {
      // The websocket package's own suite: routes, the /ws runner, MCP tool
      // resolution, drain/shutdown. Multi-minute (255 files), so this stays
      // an --expensive selfcheck rather than the default gate.
      command: "npm run test --workspace=packages/websocket",
      cost: "expensive"
    }
  },
  {
    id: "data-models",
    title: "Data models (Drizzle ORM persistence layer)",
    command: "npm run test --workspace=packages/models",
    kind: "static",
    capabilities: ["no-db"],
    docs: "packages/models/AGENTS.md",
    selfcheck: {
      command: "npm run test --workspace=packages/models",
      cost: "cheap"
    }
  },
  {
    id: "storage-and-security",
    title: "Storage, security, auth, and config packages",
    command:
      "npm run test --workspace=packages/storage && " +
      "npm run test --workspace=packages/security && " +
      "npm run test --workspace=packages/auth && " +
      "npm run test --workspace=packages/config",
    kind: "static",
    capabilities: ["no-db"],
    docs: "packages/AGENTS.md",
    selfcheck: {
      command:
        "npm run test --workspace=packages/storage && " +
        "npm run test --workspace=packages/security && " +
        "npm run test --workspace=packages/auth && " +
        "npm run test --workspace=packages/config",
      cost: "cheap"
    }
  },
  {
    id: "node-pack-parity",
    title:
      "Node-pack example-workflow parity (every shipped node covered by an example)",
    command: "npm test --workspace=@nodetool-ai/base-nodes -- parity example-workflows",
    kind: "static",
    // Runs in the quality-checks.yml typecheck leg (pull_request-triggered),
    // by this exact command.
    capabilities: ["no-db", "gated:pr"],
    docs: "packages/base-nodes/AGENTS.md",
    selfcheck: {
      command:
        "npm test --workspace=@nodetool-ai/base-nodes -- parity example-workflows",
      cost: "cheap"
    }
  },
  {
    id: "shared-services",
    title: "Shared service libraries (vector store, model pricing)",
    command:
      "npm run test --workspace=packages/vectorstore && " +
      "npm run test --workspace=packages/model-pricing",
    kind: "static",
    capabilities: ["no-db"],
    docs: "packages/AGENTS.md",
    selfcheck: {
      command:
        "npm run test --workspace=packages/vectorstore && " +
        "npm run test --workspace=packages/model-pricing",
      cost: "cheap"
    }
  },
  {
    id: "execution-session-audit",
    title:
      "Execution session hydration audit (registry handed without a resolver)",
    command:
      "npm run test --workspace=packages/execution -- execution-session-hydration-audit",
    kind: "static",
    // No workflow names this test file by substring today (it runs inside
    // the whole-package `packages/execution` leg), so no `gated:*` tag.
    capabilities: ["no-db"],
    docs: "docs/HARNESS_FIRST.md",
    selfcheck: {
      command:
        "npm run test --workspace=packages/execution -- execution-session-hydration-audit",
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
    harnesses: [
      "validate",
      "debug",
      "node-run",
      "reliability-ring0",
      "execution-session-audit"
    ],
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
    id: "agent-capabilities",
    title: "Agent capabilities (the wire names a guest or a model calls)",
    harnesses: ["capability-suites", "eval", "jtbd"],
    paths: [
      "packages/agents/src/capabilities/",
      // The signal analysis behind the `analyze_*` / `detect_*` capabilities.
      // It exists only to serve them, so a change here is a change to them.
      "packages/agents/src/analysis/",
      "packages/agents/src/evals/",
      "packages/agents/src/jtbd/",
      "packages/cli/src/harness/capability-table.ts",
      "packages/cli/src/harness/capability-coverage.ts",
      "scripts/sync-capability-coverage.mjs"
    ]
  },
  {
    id: "generation-tracking",
    title: "Media generation tracking (the seam, the tracker, the generations capabilities)",
    harnesses: ["capability-suites"],
    // `capability-suites` runs the tracker, seam and capability suites named
    // in the capability table, plus the seam audit that fails on a provider
    // media call outside `runGeneration` (packages/execution/tests/
    // generation-seam-audit.test.ts). Design:
    // docs/media-generation-tracking-design.md.
    paths: [
      "packages/execution/src/generation-tracker.ts",
      "packages/runtime/src/generation-receipt.ts",
      "packages/runtime/src/generation-registry.ts",
      "packages/runtime/src/redact-params.ts",
      "packages/agents/src/capabilities/generations.ts",
      "packages/agents/src/capabilities/generations.specs.ts",
      "packages/cli/src/commands/generations.ts"
    ]
  },
  {
    id: "live-browser",
    title: "Live browser (browser_* capabilities, CDP, the Chrome extension relay)",
    harnesses: ["capability-suites"],
    // `capability-suites` covers the seam — dispatch, classification, and what
    // a process with no action layer answers. The half below it runs in
    // `npm run test:integration --workspace=packages/browser`, which
    // launches a real Chrome with the built extension loaded and drives the
    // production transport end to end. It is not a selfcheck: it downloads
    // Chrome and binds port 7777, so a diff to the relay still needs it run
    // by hand.
    paths: [
      "chrome-extension/",
      "packages/browser/",
      "packages/agents/src/capabilities/browser.ts",
      "packages/agents/src/capabilities/browser.specs.ts",
      "packages/websocket/src/extension-cdp-bridge.ts"
    ],
  },
  {
    id: "provider-clients",
    title: "LLM and media provider clients (request shaping + response decoding)",
    harnesses: ["provider-contract", "eval"],
    paths: [
      "packages/runtime/src/providers/",
      // Local-models BaseProvider (transformers.js/kokoro-js) — same request/
      // response contract as the hosted providers, packaged separately
      // because its weights and native deps are optional.
      "packages/transformers-js-provider/"
    ]
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
      // The paint core behind sketches: types, dependency hashing, seeded
      // layer templates, host-neutral raster ops.
      "packages/image-editor/",
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
    // `validate` covers the shipped example boards: its selfcheck,
    // `npm run validate:examples`, checks each one's shot text and media.
    harnesses: [
      "script-storyboard-link",
      "timeline-validate",
      "validate",
      "eval"
    ],
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
      "packages/websocket/src/lib/example-storyboards.ts",
      // The shipped boards and the generator behind them. `validate:examples`
      // checks each one's shot text and that its stills and clips are on disk.
      "packages/base-nodes/nodetool/examples/storyboards/",
      "scripts/build-example-storyboards.mjs",
      "scripts/example-storyboards/",
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
    id: "model3d",
    title: "3D models (glTF scenes, ui_3d_* tools, model3d capabilities)",
    harnesses: ["capability-suites", "eval"],
    paths: [
      "packages/model3d/",
      "packages/agents/src/capabilities/model3d.ts",
      "packages/agents/src/capabilities/model3d.specs.ts",
      "packages/agents/src/evals/surfaces/model3d.ts",
      "web/src/components/model_editor/",
      "web/src/components/workspace/Model3DSurface.tsx",
      "web/src/lib/tools/builtin/model3d.ts"
    ]
  },
  {
    id: "godot",
    title: "Godot game pipeline (slot contract, game nodes, project writer, templates, godot capabilities)",
    harnesses: ["capability-suites"],
    paths: [
      "packages/protocol/src/game-assets.ts",
      "packages/protocol/fixtures/game-assets/",
      "packages/godot/",
      "packages/godot-templates/",
      "packages/image-nodes/src/nodes/game.ts",
      "packages/audio-nodes/src/nodes/game.ts",
      "packages/agents/src/capabilities/godot.ts",
      "packages/agents/src/capabilities/godot.specs.ts"
    ]
  },
  {
    id: "blender",
    title: "Blender headless render (op scripts, runner, blender nodes)",
    harnesses: ["blender"],
    paths: ["packages/blender-nodes/"]
  },
  {
    id: "entities",
    title: "Entity library (ingredients, prompt injection, ui_entity_* tools)",
    harnesses: ["capability-suites"],
    paths: [
      "packages/agents/src/capabilities/entities.ts",
      "packages/agents/src/capabilities/entities.specs.ts",
      "web/src/components/entities/",
      "web/src/serverState/useEntities.ts",
      "web/src/lib/tools/builtin/entities.ts"
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
    id: "provider-codegen",
    title: "Generated FAL, KIE, and Replicate provider metadata (node manifests, node source)",
    harnesses: ["provider-codegen"],
    paths: [
      "packages/fal-codegen/",
      "packages/kie-codegen/",
      // Replicate's generator has no fixture-mode drift check of its own yet
      // (unlike fal/kie) — a diff here still runs the fal/kie selfcheck,
      // which is the closest real coverage until one is written.
      "packages/replicate-codegen/",
      "packages/fal-nodes/src/fal-manifest.json",
      "packages/kie-nodes/src/kie-manifest.json",
      "scripts/provider-codegen-check.mjs"
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
    id: "public-app-deployments",
    title: "Deployed mini apps (hidden URL, no login)",
    harnesses: [],
    paths: [
      "packages/websocket/src/lib/app-deployment-service.ts",
      "packages/websocket/src/lib/app-session-scope.ts",
      "packages/websocket/src/routes/public-apps.ts",
      "packages/auth/src/providers/app-session-token-provider.ts",
      "packages/models/src/application-deployment.ts",
      "web/src/components/applications/PublicAppPage.tsx"
    ],
    gap:
      "Covered by unit tests only, and the two halves they cannot reach are " +
      "the ones that matter: what a real logged-out browser can load from " +
      "the link, and what the auth hook actually refuses an `nda_` token " +
      "outside `/ws`. A harness would boot the server with " +
      "NODETOOL_ENV=production, deploy a published example app, then (a) " +
      "walk every non-`/ws` path with the minted session and assert 401, and " +
      "(b) drive the page with Playwright carrying no account session, the " +
      "way the debug harness drives the graph canvas."
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
  },
  {
    id: "api-server",
    title: "API server (Fastify HTTP + WebSocket routes)",
    harnesses: ["api-routes"],
    paths: ["packages/websocket/"]
  },
  {
    id: "data-models",
    title: "Data models (SQLite/Postgres persistence, Drizzle ORM)",
    harnesses: ["data-models"],
    paths: ["packages/models/"]
  },
  {
    id: "storage-and-security",
    title: "Storage, secrets, auth middleware, and config loading",
    harnesses: ["storage-and-security"],
    paths: [
      "packages/storage/",
      "packages/security/",
      "packages/auth/",
      "packages/config/"
    ]
  },
  {
    id: "domain-nodes",
    title: "Domain node packages (provider and media node factories)",
    harnesses: ["node-run", "validate", "node-pack-parity"],
    paths: [
      "packages/atlascloud-nodes/",
      "packages/audio-nodes/",
      "packages/automation-nodes/",
      "packages/code-nodes/",
      "packages/core-nodes/",
      "packages/data-nodes/",
      "packages/document-nodes/",
      "packages/elevenlabs-nodes/",
      "packages/fal-nodes/",
      // Shared by the node packages, not a node package itself: the blend-mode
      // catalog/WGSL functions (gpu) and HuggingFace cache/discovery
      // (huggingface, paired with huggingface-nodes). CI groups both with the
      // `*-nodes` filter in quality-checks.yml's test-packages-nodes leg.
      "packages/gpu/",
      "packages/huggingface/",
      "packages/huggingface-nodes/",
      "packages/image-nodes/",
      "packages/integration-nodes/",
      "packages/kie-nodes/",
      "packages/llm-nodes/",
      "packages/minimax-nodes/",
      "packages/nodes-utils/",
      "packages/replicate-nodes/",
      "packages/reve-nodes/",
      "packages/text-nodes/",
      "packages/together-nodes/",
      "packages/topaz-nodes/",
      "packages/transformers-js-nodes/",
      "packages/video-nodes/",
      // Portable runner (graph + registry → a Request/Response handler); CI
      // groups it with the node packages for the same reason.
      "packages/workflow-runner/"
    ]
  },
  {
    id: "shared-services",
    title: "Shared service libraries (vector store, model pricing)",
    harnesses: ["shared-services"],
    paths: ["packages/vectorstore/", "packages/model-pricing/"]
  },
  {
    id: "repo-scripts",
    title: "Repo tooling scripts (scripts/)",
    harnesses: ["repo-scripts"],
    // Overlaps with the surfaces that claim individual scripts (bundle
    // staging, codegen drift, docker smoke); a diff there runs both.
    paths: ["scripts/"]
  },
  {
    id: "recipes",
    title: "Recipes (ordered chains of shipped examples)",
    harnesses: ["recipes"],
    // The manifests, the resolver behind the app's Examples listing, and the
    // site pages built from the same files. Overlaps the surfaces that claim
    // the packages and the site; a diff here runs both.
    paths: [
      "packages/base-nodes/nodetool/examples/recipes/",
      "packages/protocol/src/api-schemas/recipes.ts",
      "packages/websocket/src/lib/example-recipes.ts",
      "web/src/components/portal/DashboardRecipes.tsx",
      "web/src/hooks/useRecipeActions.ts",
      "marketing/scripts/generate-recipes.mjs",
      "marketing/scripts/recipes.mjs",
      "marketing/src/app/recipes/",
      "marketing/src/data/recipes.ts"
    ]
  },
  {
    id: "marketing-site",
    title: "Marketing site (nodetool.ai)",
    harnesses: [],
    paths: ["marketing/"],
    gap:
      "A separate npm project with its own lockfile, so the root gate cannot " +
      "install it: marketing-ci.yml runs its typecheck, lint, Next build, " +
      "generated-data --check steps, a Playwright smoke suite and a route " +
      "loader against its own tree. The one part the root gate does reach is " +
      "the recipe pages, whose data comes from the shipped manifests — that " +
      "is the `recipes` harness above. A fuller harness would drive the built " +
      "site the way the debug harness drives the graph canvas.",
  },
  {
    id: "harness-registry",
    title: "Harness registry (this file, its tests, capability sync)",
    harnesses: ["harness-audit"],
    paths: [
      "packages/cli/src/harness/",
      "packages/cli/tests/harness-registry.test.ts",
      "packages/cli/tests/capability-coverage.test.ts",
      "scripts/sync-capability-coverage.mjs"
    ]
  }
];

/**
 * Package/app directories with no `SurfaceEntry.paths` prefix pointing into
 * them, and why: what a diff there cannot verify headlessly today, and what
 * closing the gap would need. This is the layer below `SurfaceEntry.gap` — a
 * surface can be uncovered by a *harness* and still claim its paths (mobile,
 * electron-shell do exactly that); an entry here has no *surface* touching it
 * at all, so a diff under it selects nothing in `nodetool harness gate` and
 * `auditPathClaims` would report it silently otherwise.
 *
 * Every directory under `packages/`, plus `web/`, `electron/`, `mobile/`,
 * must appear in some `SurfaceEntry.paths` or here —
 * `tests/harness-registry.test.ts` walks the real repo and fails the build on
 * one that is in neither.
 */
export const UNCLAIMED_PATHS: Record<string, string> = {
  "packages/compute/":
    "Provisions and reaps real RunPod/Vast.ai GPU workers; only its hermetic " +
    "unit tests run headlessly today. A harness needs a recorded-fixture " +
    "mode against a fake provider API, the way `blender` and " +
    "`provider-contract` fake their externals.",
  "packages/deploy/":
    "The `nodetool deploy` toolkit (Docker/SSH/RunPod/GCP/Supabase " +
    "self-hosting) needs a real target to prove a rollout; only its " +
    "planning-logic unit tests run headlessly today.",
  "packages/sdk/":
    "Generated TypeScript client re-exporting the tRPC/WebSocket surface; " +
    "has no test script of its own (build + lint only) — exercised " +
    "indirectly through the `api-routes` suite it wraps.",
  "packages/system-skills/":
    "Not an npm workspace, just SKILL.md files staged into the packaged " +
    "backend by scripts/bundle-backend.mjs; verify-backend-bundle.mjs " +
    "checks every directory ships, not the skill content."
};

/**
 * Whether a repo-relative file sits under a directory {@link UNCLAIMED_PATHS}
 * already documents as having no harness. `nodetool harness gate` uses this so
 * a diff touching such a directory is not reported as an unmapped code file —
 * the judgement, and its reason, are already recorded above.
 */
export function isUnclaimedPath(file: string): boolean {
  return Object.keys(UNCLAIMED_PATHS).some((prefix) => file.startsWith(prefix));
}

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
      .filter((id) => !referenced.has(id) && id !== "affected")
  };
}

/**
 * Directories under `packages/` (plus `web/`, `electron/`, `mobile/`) that no
 * `SurfaceEntry.paths` prefix and no `UNCLAIMED_PATHS` entry references. A
 * non-empty result means a diff under one of them selects nothing in
 * `nodetool harness gate` — silently, since no surface even names the path.
 *
 * `rootDirs` are repo-relative directory paths (e.g. `"packages/models"`, a
 * trailing slash is added if missing). A directory is claimed when some
 * surface path or `UNCLAIMED_PATHS` key falls inside it, equals it, or is one
 * of its ancestors — the same "prefix either way" relationship `planGate`
 * uses to route a changed file to a surface.
 */
export function auditPathClaims(
  rootDirs: string[],
  surfaces: SurfaceEntry[] = SURFACES,
  unclaimed: Record<string, string> = UNCLAIMED_PATHS
): string[] {
  const claims = [...surfaces.flatMap((s) => s.paths), ...Object.keys(unclaimed)];
  return rootDirs.filter((dir) => {
    const prefix = dir.endsWith("/") ? dir : `${dir}/`;
    return !claims.some((p) => p.startsWith(prefix) || prefix.startsWith(p));
  });
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
