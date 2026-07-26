/**
 * `nodetool apps export-bundle` / `import-bundle` (src/commands/apps.ts).
 *
 * The models layer is an in-memory fake; app-runtime is the real thing (the
 * vitest config aliases it to source). The round trip clears the fake store
 * between export and import, so an app that comes back has to have been rebuilt
 * from the file alone.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Command } from "commander";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface FakeApp {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  description: string;
  document: string;
  updated_at: string;
  toDocument: () => unknown;
}

interface FakeWorkflow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  graph: unknown;
  getGraph: () => unknown;
}

const store = {
  apps: new Map<string, FakeApp>(),
  workflows: new Map<string, FakeWorkflow>()
};
let idCounter = 0;

vi.mock("@nodetool-ai/models", () => ({
  createTimeOrderedUuid: () => `new-id-${++idCounter}`,
  releasedApplicationRelease: vi.fn().mockResolvedValue(null),
  Application: {
    findById: async (id: string) => store.apps.get(id) ?? null,
    listByUser: async () => [...store.apps.values()],
    create: async (data: Record<string, unknown>) => {
      const app: FakeApp = {
        id: `app-${++idCounter}`,
        user_id: String(data.user_id),
        project_id: String(data.project_id ?? "default"),
        name: String(data.name),
        description: String(data.description ?? ""),
        document: String(data.document),
        updated_at: "2026-01-01T00:00:00.000Z",
        toDocument: () => JSON.parse(String(data.document))
      };
      store.apps.set(app.id, app);
      return app;
    }
  },
  Workflow: {
    find: async (_userId: string, id: string) =>
      store.workflows.get(id) ?? null,
    create: async (data: Record<string, unknown>) => {
      const workflow: FakeWorkflow = {
        id: String(data.id),
        user_id: String(data.user_id),
        name: String(data.name),
        description: String(data.description ?? ""),
        graph: data.graph,
        getGraph: () => data.graph
      };
      store.workflows.set(workflow.id, workflow);
      return workflow;
    }
  }
}));

vi.mock("../src/commands/local-db.js", () => ({
  setupLocalDb: vi.fn().mockResolvedValue(undefined),
  LOCAL_USER_ID: "1"
}));

async function captureOutput(
  fn: () => Promise<void> | void
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;
  const origLog = console.log;
  const origErr = console.error;
  const origExit = process.exit;
  console.log = (...args: unknown[]) => {
    stdout += args.map(String).join(" ") + "\n";
  };
  console.error = (...args: unknown[]) => {
    stderr += args.map(String).join(" ") + "\n";
  };
  process.exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__EXIT__${code ?? 0}`);
  }) as typeof process.exit;
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith("__EXIT__")) throw e;
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.exit = origExit;
  }
  return { stdout, stderr, exitCode };
}

async function run(argv: string[]) {
  const { registerAppsCommands } = await import("../src/commands/apps.js");
  const program = new Command();
  program.exitOverride();
  registerAppsCommands(program);
  return captureOutput(() => program.parseAsync(["node", "nodetool", ...argv]));
}

const graphOf = (nodeId: string) => ({
  nodes: [{ id: nodeId, type: "nodetool.text.Concat" }],
  edges: []
});

function seed(): void {
  store.workflows.set("wf-draft", {
    id: "wf-draft",
    user_id: "1",
    name: "Draft copy",
    description: "writes a draft",
    graph: graphOf("draft-node"),
    getGraph: () => graphOf("draft-node")
  });
  store.workflows.set("wf-refine", {
    id: "wf-refine",
    user_id: "1",
    name: "Refine copy",
    description: "",
    graph: graphOf("refine-node"),
    getGraph: () => graphOf("refine-node")
  });
  const document = {
    schemaVersion: 3,
    ui: { root: { props: {} }, content: [], zones: {} },
    operations: [
      {
        id: "draft",
        name: "Draft",
        workflowId: "wf-draft",
        inputs: {},
        outputs: {},
        policy: "replace"
      },
      {
        id: "refine",
        name: "Refine",
        workflowId: "wf-refine",
        inputs: {},
        outputs: {},
        policy: "replace"
      }
    ],
    resources: [],
    variables: []
  };
  store.apps.set("app-1", {
    id: "app-1",
    user_id: "1",
    project_id: "p1",
    name: "Copywriter",
    description: "draft then refine",
    document: JSON.stringify(document),
    updated_at: "2026-01-01T00:00:00.000Z",
    toDocument: () => document
  });
}

describe("nodetool apps bundles", () => {
  beforeEach(() => {
    store.apps.clear();
    store.workflows.clear();
    idCounter = 0;
    seed();
  });

  it("round-trips an app and its workflows through a bundle file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nodetool-apps-"));
    const file = join(dir, "copywriter.app.json");

    const exported = await run(["apps", "export-bundle", "app-1", "-o", file]);
    expect(exported.exitCode).toBeNull();
    expect(exported.stdout.trim()).toBe(file);

    const bundle = JSON.parse(await readFile(file, "utf8"));
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.name).toBe("Copywriter");
    expect(bundle.workflows.map((w: { key: string }) => w.key)).toEqual([
      "draft-copy",
      "refine-copy"
    ]);
    expect(
      bundle.app.operations.map((o: { workflowId: string }) => o.workflowId)
    ).toEqual(["draft-copy", "refine-copy"]);

    // A clean library: nothing an old id could resolve against.
    store.apps.clear();
    store.workflows.clear();

    const imported = await run(["apps", "import-bundle", file, "--json"]);
    expect(imported.exitCode).toBeNull();
    const created = JSON.parse(imported.stdout);
    expect(created.workflows).toHaveLength(2);

    const app = store.apps.get(created.id);
    expect(app?.name).toBe("Copywriter");
    const operations = (
      app!.toDocument() as { operations: { workflowId: string }[] }
    ).operations;
    expect(operations.map((o) => o.workflowId)).toEqual(
      created.workflows.map((w: { id: string }) => w.id)
    );
    for (const op of operations) {
      expect(store.workflows.has(op.workflowId)).toBe(true);
    }
    expect(store.workflows.get(operations[0]!.workflowId)?.getGraph()).toEqual(
      graphOf("draft-node")
    );
  });

  it("fails on a file that is not a bundle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nodetool-apps-"));
    const file = join(dir, "junk.json");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, JSON.stringify({ hello: "world" }), "utf8");

    const result = await run(["apps", "import-bundle", file]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Not a valid application bundle");
  });

  it("fails on an unknown application id", async () => {
    const result = await run(["apps", "export-bundle", "nope"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Application not found: nope");
  });

  it("lists apps as JSON", async () => {
    const result = await run(["apps", "list", "--json"]);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        id: "app-1",
        name: "Copywriter",
        operations: 2,
        updated_at: "2026-01-01T00:00:00.000Z"
      }
    ]);
  });
});
