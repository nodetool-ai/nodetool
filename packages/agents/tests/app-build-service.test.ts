/**
 * `runApplicationBuild` — the server entry point behind
 * `POST /api/applications/build`.
 *
 * The build itself (`buildApp`) is stubbed here, because what this module owns
 * is everything around it: which provider and model a build spends on, which
 * numbers the body may carry, the session a `poll: true` caller reads, what a
 * cancel settles as, and the payload the report becomes. Those are the parts
 * that cost money or lose work. The orchestrator has its own suite
 * (`app-build-build.test.ts`), which runs the real stages.
 *
 * The database is a real in-memory one, so the workflow loader and the
 * "a green build installs nothing" claim are checked against rows rather than
 * against a mock.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Application, Workflow, initTestDb } from "@nodetool-ai/models";
import { AppServiceError, debugSessions } from "@nodetool-ai/execution/service";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { BaseProvider } from "@nodetool-ai/runtime";
import type { ApplicationBundle } from "@nodetool-ai/app-runtime";
import type { BuildAppOptions } from "../src/app-build/build.js";
import type { BuildReport, BuildSpec } from "../src/app-build/types.js";
import {
  runApplicationBuild,
  type AppBuildDeps
} from "../src/app-build/build-service.js";

const buildApp = vi.fn<(opts: BuildAppOptions) => Promise<BuildReport>>();

vi.mock("../src/app-build/build.js", () => ({
  buildApp: (opts: BuildAppOptions) => buildApp(opts),
  DEFAULT_BUILD_COST_CAP_USD: 2
}));

// --- fixtures ---------------------------------------------------------------

const registry = {
  has: () => true,
  getMetadata: () => undefined,
  validateNode: () => []
} as unknown as NodeRegistry;

const providerNamed = (id: string): BaseProvider =>
  ({ provider: id, getTotalCost: () => 0 }) as unknown as BaseProvider;

const SPEC: BuildSpec = {
  title: "Drafter",
  operations: [
    {
      id: "draft",
      objective: "draft a note from a prompt",
      inputs: [{ name: "prompt", type: "string", example: "a haiku" }],
      outputs: [{ name: "text", type: "string" }],
      streaming: false
    }
  ],
  variables: [],
  widgets: [
    {
      role: "prompt-input",
      type: "TextInput",
      binding: "op:draft/in:prompt",
      label: "Prompt"
    },
    { role: "run-button", type: "Button", binding: "", label: "Draft it" },
    {
      role: "draft-output",
      type: "Markdown",
      binding: "op:draft/out:text",
      label: "Draft"
    }
  ],
  interactions: [
    {
      name: "draft-once",
      steps: [{ click: "run-button" }],
      expect: [{ widget: "draft-output", check: "nonEmpty" }]
    }
  ]
};

const BUNDLE = {
  application: { id: "app-1", name: "Drafter" },
  workflows: {}
} as unknown as ApplicationBundle;

const reportOf = (over: Partial<BuildReport> = {}): BuildReport =>
  ({
    target: { prompt: "an app that drafts a note" },
    spec: SPEC,
    interactions: [],
    stages: [],
    repairs: [],
    appDebug: null,
    judge: null,
    supervision: null,
    verdict: { ok: true, reason: "green on the first pass", notSimulated: [] },
    cost: { usd: 0.5, byStage: {} },
    bundle: BUNDLE,
    ...over
  }) as BuildReport;

/** Every seam production leaves alone, closed so no test reaches a real one. */
const deps = (
  providers: Record<string, BaseProvider> = {}
): AppBuildDeps & { createProvider: ReturnType<typeof vi.fn> } => {
  const createProvider = vi.fn(async (id: string) => providerNamed(id));
  return { createProvider, loadProviders: async () => providers, registry };
};

/** The options `buildApp` was called with, for a call that must have happened. */
const optionsPassed = (): BuildAppOptions => {
  const call = buildApp.mock.calls[0]?.[0];
  if (!call) throw new Error("buildApp was never called");
  return call;
};

let userSeq = 0;
/** A fresh user per test: the session registry caps live sessions per user. */
const nextUser = (): string => `user-build-${++userSeq}`;

beforeEach(() => {
  initTestDb();
  buildApp.mockReset();
  buildApp.mockResolvedValue(reportOf());
  vi.stubEnv("NODETOOL_APP_BUILD_PROVIDER", "");
  vi.stubEnv("NODETOOL_APP_BUILD_MODEL", "");
  vi.stubEnv("NODETOOL_APP_JUDGE_MODEL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// --- provider and model resolution ------------------------------------------

describe("runApplicationBuild — which model it spends on", () => {
  it("uses the provider and model the body names", async () => {
    const d = deps();
    await runApplicationBuild(
      nextUser(),
      { prompt: "a drafting app", provider: "anthropic", model: "claude-sonnet-5" },
      registry,
      d
    );

    expect(d.createProvider.mock.calls[0]?.[0]).toBe("anthropic");
    expect(optionsPassed().model).toBe("claude-sonnet-5");
  });

  it("falls back to NODETOOL_APP_BUILD_PROVIDER / _MODEL", async () => {
    vi.stubEnv("NODETOOL_APP_BUILD_PROVIDER", "openai");
    vi.stubEnv("NODETOOL_APP_BUILD_MODEL", "gpt-5.4-mini");
    const d = deps();

    await runApplicationBuild(nextUser(), { prompt: "a drafting app" }, registry, d);

    expect(d.createProvider.mock.calls[0]?.[0]).toBe("openai");
    expect(optionsPassed().model).toBe("gpt-5.4-mini");
  });

  it("prefers the body over the environment", async () => {
    vi.stubEnv("NODETOOL_APP_BUILD_PROVIDER", "openai");
    vi.stubEnv("NODETOOL_APP_BUILD_MODEL", "gpt-5.4-mini");
    const d = deps();

    await runApplicationBuild(
      nextUser(),
      { prompt: "a drafting app", provider: "anthropic", model: "claude-sonnet-5" },
      registry,
      d
    );

    expect(d.createProvider.mock.calls[0]?.[0]).toBe("anthropic");
    expect(optionsPassed().model).toBe("claude-sonnet-5");
  });

  it("refuses to build when nothing resolves a provider and a model", async () => {
    const d = deps();
    const error = await runApplicationBuild(
      nextUser(),
      { prompt: "a drafting app" },
      registry,
      d
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppServiceError);
    expect((error as AppServiceError).code).toBe("invalid_input");
    expect((error as AppServiceError).message).toBe(
      "An app build needs a provider and a model — pass them in the body, or " +
        "set NODETOOL_APP_BUILD_PROVIDER and NODETOOL_APP_BUILD_MODEL."
    );
    // Nothing was created and nothing was spent.
    expect(d.createProvider).not.toHaveBeenCalled();
    expect(buildApp).not.toHaveBeenCalled();
  });

  it("refuses a half-resolved selection — a model with no provider", async () => {
    vi.stubEnv("NODETOOL_APP_BUILD_MODEL", "gpt-5.4-mini");

    await expect(
      runApplicationBuild(nextUser(), { prompt: "an app" }, registry, deps())
    ).rejects.toThrow(/needs a provider and a model/);
    expect(buildApp).not.toHaveBeenCalled();
  });
});

// --- what the body may carry -------------------------------------------------

describe("runApplicationBuild — body validation", () => {
  const body = (over: Record<string, unknown>) => ({
    prompt: "a drafting app",
    provider: "anthropic",
    model: "claude-sonnet-5",
    ...over
  });

  it("needs either a prompt or a spec", async () => {
    await expect(
      runApplicationBuild(
        nextUser(),
        { provider: "anthropic", model: "claude-sonnet-5" },
        registry,
        deps()
      )
    ).rejects.toThrow("An app build needs either a prompt or a spec.");
  });

  it("treats a blank prompt as no prompt", async () => {
    await expect(
      runApplicationBuild(nextUser(), body({ prompt: "   " }), registry, deps())
    ).rejects.toThrow("An app build needs either a prompt or a spec.");
  });

  it("reports why a spec was rejected instead of building from it", async () => {
    const error = await runApplicationBuild(
      nextUser(),
      body({ spec: { title: "Drafter", operations: [] } }),
      registry,
      deps()
    ).catch((e: unknown) => e);

    expect((error as AppServiceError).code).toBe("invalid_input");
    expect((error as AppServiceError).message).toMatch(/^Invalid spec: /);
    expect(buildApp).not.toHaveBeenCalled();
  });

  it("passes a valid spec through and drops the prompt", async () => {
    await runApplicationBuild(
      nextUser(),
      body({ spec: SPEC, prompt: undefined }),
      registry,
      deps()
    );

    expect(optionsPassed().spec?.title).toBe("Drafter");
    expect(optionsPassed().prompt).toBeUndefined();
  });

  it("rejects a cost cap of zero rather than replacing it with the default", async () => {
    const error = await runApplicationBuild(
      nextUser(),
      body({ cost_cap_usd: 0 }),
      registry,
      deps()
    ).catch((e: unknown) => e);

    expect((error as AppServiceError).message).toBe(
      "cost_cap_usd must be a positive number."
    );
    expect(buildApp).not.toHaveBeenCalled();
  });

  it("rejects a negative timeout and a fractional repair count", async () => {
    await expect(
      runApplicationBuild(nextUser(), body({ timeout_ms: -1 }), registry, deps())
    ).rejects.toThrow("timeout_ms must be a positive number.");
    await expect(
      runApplicationBuild(nextUser(), body({ max_repairs: 1.5 }), registry, deps())
    ).rejects.toThrow("max_repairs must be a non-negative integer.");
    await expect(
      runApplicationBuild(
        nextUser(),
        body({ cost_cap_usd: "1.00" }),
        registry,
        deps()
      )
    ).rejects.toThrow("cost_cap_usd must be a positive number.");
  });

  it("forwards the bounds the body did give", async () => {
    await runApplicationBuild(
      nextUser(),
      body({
        cost_cap_usd: 0.25,
        max_repairs: 0,
        timeout_ms: 60_000,
        workflow_ids: ["wf1", "wf2"]
      }),
      registry,
      deps()
    );

    const opts = optionsPassed();
    expect(opts.costCapUsd).toBe(0.25);
    expect(opts.maxRepairs).toBe(0);
    expect(opts.timeoutMs).toBe(60_000);
    expect(opts.pinnedWorkflowIds).toEqual(["wf1", "wf2"]);
  });

  it("caps spend at the harness default when the body names no cap", async () => {
    await runApplicationBuild(nextUser(), body({}), registry, deps());

    const opts = optionsPassed();
    expect(opts.costCapUsd).toBe(2);
    expect(opts.maxRepairs).toBeUndefined();
    expect(opts.timeoutMs).toBeUndefined();
    expect(opts.pinnedWorkflowIds).toBeUndefined();
  });

  it("reports a build that overran its cap as failed, naming the cap", async () => {
    buildApp.mockResolvedValue(
      reportOf({
        bundle: null,
        verdict: {
          ok: false,
          reason:
            "cost budget exhausted ($0.25) — the app was built but overran its cap",
          notSimulated: []
        }
      })
    );

    const payload = await runApplicationBuild(
      nextUser(),
      body({ cost_cap_usd: 0.25 }),
      registry,
      deps()
    );

    expect(payload["status"]).toBe("failed");
    expect(
      (payload["verdict"] as { reason: string }).reason
    ).toBe("cost budget exhausted ($0.25) — the app was built but overran its cap");
    expect(payload["install"]).toBeNull();
  });
});

// --- the judge ---------------------------------------------------------------

describe("runApplicationBuild — judge selection", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    prompt: "a drafting app",
    provider: "anthropic",
    model: "claude-sonnet-5",
    ...over
  });

  it("judges with a configured second provider when one is named", async () => {
    const openai = providerNamed("openai");
    await runApplicationBuild(
      nextUser(),
      body({ judge_model: "openai/gpt-5.4-mini" }),
      registry,
      deps({ openai })
    );

    expect(optionsPassed().judge).toEqual({
      provider: openai,
      model: "gpt-5.4-mini"
    });
  });

  it("reads a bare judge model on the builder's own provider", async () => {
    await runApplicationBuild(
      nextUser(),
      body({ judge_model: "claude-haiku-4-5" }),
      registry,
      deps()
    );

    const opts = optionsPassed();
    expect(opts.judge?.model).toBe("claude-haiku-4-5");
    expect(opts.judge?.provider).toBe(opts.provider);
  });

  it("takes the judge from NODETOOL_APP_JUDGE_MODEL when the body names none", async () => {
    vi.stubEnv("NODETOOL_APP_JUDGE_MODEL", "openai/gpt-5.4-mini");
    const openai = providerNamed("openai");

    await runApplicationBuild(nextUser(), body(), registry, deps({ openai }));

    expect(optionsPassed().judge).toEqual({
      provider: openai,
      model: "gpt-5.4-mini"
    });
  });

  it("lets the builder grade itself when no other provider is configured", async () => {
    await runApplicationBuild(
      nextUser(),
      body({ provider: "scripted", model: "scripted-1" }),
      registry,
      deps()
    );

    const opts = optionsPassed();
    expect(opts.judge?.provider).toBe(opts.provider);
    expect(opts.judge?.model).toBe("scripted-1");
  });
});

// --- the session a build is fronted by ---------------------------------------

describe("runApplicationBuild — poll, cancel, and the session", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    prompt: "a drafting app",
    provider: "anthropic",
    model: "claude-sonnet-5",
    ...over
  });

  it("returns a session id immediately with poll: true, then the report", async () => {
    let release: (report: BuildReport) => void = () => {};
    buildApp.mockImplementation(
      () => new Promise<BuildReport>((resolve) => (release = resolve))
    );
    const userId = nextUser();

    const started = await runApplicationBuild(
      userId,
      body({ poll: true }),
      registry,
      deps()
    );

    expect(started["status"]).toBe("running");
    const sessionId = started["session_id"] as string;
    const buildId = started["build_id"] as string;
    expect(buildId).toMatch(/^app-build-/);
    expect(started["poll"]).toBe(`GET /api/debug/sessions/${sessionId}`);
    expect(started["cancel"]).toBe(
      `POST /api/debug/sessions/${sessionId}/cancel`
    );

    const session = debugSessions.get(sessionId, userId);
    expect(session?.jobId).toBe(buildId);
    expect(session?.workflowId).toBeNull();
    expect(session?.peek()).toEqual({ kind: "running" });

    release(reportOf());
    const event = await session!.waitForEvent();
    expect(event.kind).toBe("done");
    const report = (event as { kind: "done"; report: Record<string, unknown> })
      .report;
    expect(report["status"]).toBe("completed");
    expect(report["build_id"]).toBe(buildId);
  });

  it("hides a session from anyone but the user who started it", async () => {
    const started = await runApplicationBuild(
      nextUser(),
      body({ poll: true }),
      registry,
      deps()
    );

    expect(
      debugSessions.get(started["session_id"] as string, "somebody-else")
    ).toBeNull();
  });

  it("settles a cancelled build as failed, with cancelled as the reason", async () => {
    // The real orchestrator answers an aborted signal with a cancelled report;
    // this stub does the same, so the cancel path is the product's.
    buildApp.mockImplementation(
      (opts: BuildAppOptions) =>
        new Promise<BuildReport>((resolve) => {
          opts.signal?.addEventListener("abort", () =>
            resolve(
              reportOf({
                bundle: null,
                verdict: { ok: false, reason: "cancelled", notSimulated: [] }
              })
            )
          );
        })
    );
    const userId = nextUser();

    const started = await runApplicationBuild(
      userId,
      body({ poll: true }),
      registry,
      deps()
    );
    const session = debugSessions.get(started["session_id"] as string, userId);
    const report = await session!.cancel();

    expect(report["status"]).toBe("failed");
    expect((report["verdict"] as { reason: string }).reason).toBe("cancelled");
    expect(report["install"]).toBeNull();
    expect(optionsPassed().signal?.aborted).toBe(true);
  });

  it("answers with a report instead of rejecting when the build throws", async () => {
    buildApp.mockRejectedValue(new Error("planner exploded"));

    const payload = await runApplicationBuild(
      nextUser(),
      body(),
      registry,
      deps()
    );

    expect(payload["status"]).toBe("failed");
    expect(payload["error"]).toBe("planner exploded");
    expect(payload["verdict"]).toEqual({
      ok: false,
      reason: "planner exploded",
      notSimulated: []
    });
  });
});

// --- the payload -------------------------------------------------------------

describe("runApplicationBuild — the report it hands back", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    prompt: "a drafting app",
    provider: "anthropic",
    model: "claude-sonnet-5",
    ...over
  });

  it("offers the bundle for import and installs nothing itself", async () => {
    const userId = nextUser();
    const payload = await runApplicationBuild(userId, body(), registry, deps());

    expect(payload["status"]).toBe("completed");
    expect(payload["bundle"]).toBe(BUNDLE);
    expect(payload["install"]).toBe(
      'POST /api/applications/import-bundle with {"bundle": <report.bundle>} to install this app.'
    );
    expect(payload["session_id"]).toEqual(expect.any(String));
    // A green build is an offer: no application row exists until the caller
    // imports the bundle.
    expect(await Application.listByUser(userId)).toEqual([]);
  });

  it("carries the build's own log lines, trimmed", async () => {
    buildApp.mockImplementation(async (opts: BuildAppOptions) => {
      opts.onLog?.("spec: 1 operation, 3 widgets\n");
      opts.onLog?.("author: placed 3 widgets   ");
      return reportOf();
    });

    const payload = await runApplicationBuild(
      nextUser(),
      body(),
      registry,
      deps()
    );

    expect(payload["log"]).toEqual([
      "spec: 1 operation, 3 widgets",
      "author: placed 3 widgets"
    ]);
  });

  it("attributes the run to the user and the build id", async () => {
    const userId = nextUser();
    await runApplicationBuild(userId, body(), registry, deps());

    const opts = optionsPassed();
    expect(opts.ledger).toEqual({ userId });
    expect(opts.buildId).toMatch(/^app-build-/);
    expect(opts.context.jobId).toBe(opts.buildId);
    expect(opts.registry).toBe(registry);
  });
});

// --- the workflow loader -----------------------------------------------------

describe("runApplicationBuild — the workflow loader it supplies", () => {
  const body = (over: Record<string, unknown> = {}) => ({
    prompt: "a drafting app",
    provider: "anthropic",
    model: "claude-sonnet-5",
    ...over
  });

  it("loads a pinned workflow's graph and name for its owner", async () => {
    const userId = nextUser();
    const graph = {
      nodes: [{ id: "in1", type: "nodetool.input.StringInput" }],
      edges: []
    };
    const workflow = await Workflow.create<Workflow>({
      user_id: userId,
      name: "Drafter graph",
      graph
    });

    let loaded: unknown;
    buildApp.mockImplementation(async (opts: BuildAppOptions) => {
      loaded = await opts.loadWorkflow?.(workflow.id);
      return reportOf();
    });

    await runApplicationBuild(
      userId,
      body({ workflow_ids: [workflow.id] }),
      registry,
      deps()
    );

    expect(loaded).toEqual({ graph, name: "Drafter graph" });
  });

  it("answers null for a workflow the user cannot read", async () => {
    const owner = nextUser();
    const workflow = await Workflow.create<Workflow>({
      user_id: owner,
      name: "Someone else's graph",
      graph: { nodes: [], edges: [] }
    });

    let loaded: unknown = "unset";
    buildApp.mockImplementation(async (opts: BuildAppOptions) => {
      loaded = await opts.loadWorkflow?.(workflow.id);
      return reportOf();
    });

    await runApplicationBuild(nextUser(), body(), registry, deps());

    expect(loaded).toBeNull();
  });
});
