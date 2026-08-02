/**
 * Tests for the headless resource provider behind `app debug`: seeding a
 * collection, feeding a `from: "resource"` param from it, mutating it with a
 * resource command, and refusing to run when nothing seeded it. The kernel
 * server runner is stubbed, so what these assert is the simulator's own
 * behaviour.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runAppDebug } from "../src/app-debug/harness.js";
import { InMemoryResourceProvider } from "../src/app-debug/runtime.js";
import { collectExecutionSummary } from "../src/debug/collector.js";
import type { ServerRunInput, ServerRunOutcome } from "../src/debug/server-runner.js";
import type { AppDebugOptions } from "../src/app-debug/types.js";

const graph = {
  nodes: [
    {
      id: "in1",
      type: "nodetool.input.StringInput",
      data: { name: "doc", value: "" }
    },
    { id: "out1", type: "nodetool.output.StringOutput", data: { name: "result" } }
  ],
  edges: []
};

/** A bundle whose one operation reads its only input from a resource binding. */
const bundleFile = (
  content: Array<Record<string, unknown>>,
  resources: Array<Record<string, unknown>>
): string => {
  const dir = mkdtempSync(join(tmpdir(), "app-resources-"));
  const file = join(dir, "app.bundle.json");
  writeFileSync(
    file,
    JSON.stringify({
      schemaVersion: 1,
      name: "Storyboard App",
      description: "",
      app: {
        schemaVersion: 3,
        ui: { root: { props: { title: "Storyboard App" } }, content, zones: {} },
        operations: [
          {
            id: "main",
            name: "Run",
            workflowId: "wf",
            inputs: { in1: { from: "resource", resourceBindingId: "boards" } },
            outputs: {},
            policy: "replace"
          }
        ],
        resources,
        variables: []
      },
      workflows: [{ key: "wf", name: "Main", graph }]
    }),
    "utf8"
  );
  return file;
};

const boards = [
  { id: "boards", name: "Boards", kind: "storyboard", scope: {}, operations: ["read", "create"] }
];

const widgets = [
  {
    type: "ResourcePicker",
    props: { id: "ResourcePicker-1", label: "Board", resourceBindingId: "boards" }
  },
  { type: "Markdown", props: { id: "Markdown-1", binding: "result" } },
  {
    type: "Button",
    props: {
      id: "Button-1",
      label: "Run",
      events: [{ trigger: "click", kind: "run", key: "", value: "" }]
    }
  },
  {
    type: "Button",
    props: {
      id: "Button-2",
      label: "New board",
      events: [
        {
          trigger: "click",
          kind: "resourceCommand",
          command: "create",
          resourceBindingId: "boards"
        }
      ]
    }
  }
];

const stubRunner = () =>
  vi.fn(async (_input: ServerRunInput): Promise<ServerRunOutcome> => {
    const messages = [
      {
        type: "output_update",
        node_id: "out1",
        output_name: "output",
        value: "rendered"
      },
      { type: "job_update", status: "completed" }
    ];
    const summary = collectExecutionSummary(messages);
    summary.status = "completed";
    return {
      report: {
        surface: "server",
        ok: true,
        status: "completed",
        error: null,
        durationMs: 5,
        summary,
        trace: null
      },
      rawMessages: messages as never[]
    };
  });

const run = async (file: string, options: AppDebugOptions) => {
  const runOnServer = stubRunner();
  const outDir = mkdtempSync(join(tmpdir(), "app-resources-out-"));
  const report = await runAppDebug(
    file,
    { outDir, ...options },
    { loadFromDb: async () => null, runOnServer }
  );
  return { report, runOnServer };
};

describe("app debug — resources", () => {
  it("runs a resource-fed param from a seeded collection", async () => {
    const { report, runOnServer } = await run(bundleFile(widgets, boards), {
      interact: [
        {
          seedResource: {
            id: "boards",
            items: [{ id: "b1", name: "Opening" }, { id: "b2", name: "Chase" }]
          }
        },
        { click: "Run" }
      ]
    });

    expect(report.interactions.map((i) => i.error)).toEqual([null, null]);
    expect(runOnServer).toHaveBeenCalledOnce();
    // The picker points at the first member until something picks another, so
    // that is the ref the run sends.
    expect(runOnServer.mock.calls[0][0].params).toEqual({
      doc: { kind: "storyboard", id: "b1", revision: 1 }
    });

    const collection = report.resources.find((r) => r.id === "boards");
    expect(collection).toMatchObject({
      kind: "storyboard",
      seeded: true,
      selected: "b1"
    });
    expect(collection?.items.map((i) => i.name)).toEqual(["Opening", "Chase"]);

    const picker = report.widgets.find((w) => w.id === "ResourcePicker-1");
    expect(picker).toMatchObject({ resourceBindingId: "boards", hasValue: true });
    expect(picker?.value).toEqual([
      { id: "b1", name: "Opening" },
      { id: "b2", name: "Chase" }
    ]);
    expect(report.verdict.ok).toBe(true);
  });

  it("seeds a collection from --params", async () => {
    const { report, runOnServer } = await run(bundleFile(widgets, boards), {
      params: { "resource:boards": [{ id: "b9", name: "Only" }] },
      interact: [{ click: "Run" }]
    });

    expect(report.interactions[0].error).toBeNull();
    expect(runOnServer.mock.calls[0][0].params).toEqual({
      doc: { kind: "storyboard", id: "b9", revision: 1 }
    });
    expect(report.resources[0].items).toEqual([
      { id: "b9", name: "Only", revision: 1 }
    ]);
  });

  it("fails the run when nothing seeded the collection, naming how to seed it", async () => {
    const { report, runOnServer } = await run(bundleFile(widgets, boards), {
      interact: [{ click: "Run" }]
    });

    expect(runOnServer).not.toHaveBeenCalled();
    expect(report.interactions[0].error).toBe(
      'Operation "main" input "in1" comes from resource binding "boards", which nothing seeded — ' +
        'seed it with an interaction step {"seedResource":{"id":"boards","items":[{"id":"item-1"}]}} ' +
        'or a "resource:boards" param.'
    );
    expect(report.resources[0]).toMatchObject({ seeded: false, selected: null });
    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.warnings).toContainEqual(
      expect.stringContaining('ResourcePicker "ResourcePicker-1" shows resource binding "boards"')
    );
  });

  it("rejects a seed for a binding the app does not declare", async () => {
    const { report } = await run(bundleFile(widgets, boards), {
      interact: [{ seedResource: { id: "scenes", items: [{ id: "s1" }] } }],
      run: false
    });

    expect(report.interactions[0].error).toBe(
      'No resource binding "scenes" is declared by this app (declared: boards).'
    );
  });

  it("mutates the collection through a resource command and reports it", async () => {
    const { report } = await run(bundleFile(widgets, boards), {
      interact: [
        { seedResource: { id: "boards", items: [{ id: "b1", name: "Opening" }] } },
        { click: "New board" },
        { click: "Run" }
      ]
    });

    expect(report.interactions.map((i) => i.error)).toEqual([null, null, null]);
    const collection = report.resources[0];
    expect(collection.items.map((i) => i.id)).toEqual(["b1", "storyboard-2"]);
    expect(collection.commands).toEqual(["create"]);
    // A created resource is what the widget points at next, so the run that
    // follows sends it.
    expect(collection.selected).toBe("storyboard-2");
    const picker = report.widgets.find((w) => w.id === "ResourcePicker-1");
    expect(picker?.value).toHaveLength(2);
  });

  it("fails a resource command against an unseeded binding", async () => {
    const { report } = await run(bundleFile(widgets, boards), {
      interact: [{ click: "New board" }],
      run: false
    });

    expect(report.interactions[0].error).toMatch(
      /Resource command "create" targets resource binding "boards", which nothing seeded/
    );
  });
});

describe("InMemoryResourceProvider", () => {
  const provider = () =>
    new InMemoryResourceProvider({
      kind: "storyboard",
      items: [{ id: "b1", name: "Opening", document: { scenes: [] } }]
    });

  it("updates an item and bumps its revision", () => {
    const p = provider();
    const updated = p.apply({
      command: "update",
      ref: p.selected(),
      args: { name: "Opening scene", document: { scenes: ["a"] } }
    });
    expect(updated).toMatchObject({
      name: "Opening scene",
      document: { scenes: ["a"] }
    });
    expect(updated?.ref.revision).toBe(2);
    expect(p.get("b1")?.name).toBe("Opening scene");
  });

  it("rejects a write whose revision is behind the item", () => {
    const p = provider();
    p.apply({ command: "update", ref: p.selected(), args: { name: "v2" } });
    expect(() =>
      p.apply({
        command: "update",
        ref: { kind: "storyboard", id: "b1", revision: 1 },
        args: { name: "stale" }
      })
    ).toThrow(/revision 1 but resource "b1" is at 2/);
  });

  it("deletes an item and drops the selection with it", () => {
    const p = provider();
    p.apply({ command: "delete", ref: p.selected() });
    expect(p.list()).toEqual([]);
    expect(p.selected()).toBeNull();
  });

  it("points at a pinned id even when the collection does not list it", () => {
    const p = new InMemoryResourceProvider({ kind: "asset", pinnedId: "pinned" });
    expect(p.selected()).toEqual({ kind: "asset", id: "pinned" });
  });
});
