/**
 * A mini app whose operation runs a JS script instead of a workflow.
 *
 * The bundle carries the pinned document, so nothing here reads a database.
 * The script runner is stubbed — what these assert is the simulator's own
 * behaviour: the script's declared ports become the bindable surface, its
 * result folds into the widgets, and the verdict catches a binding naming a
 * port the script does not declare or a target nothing can resolve.
 */
import { describe, expect, it, vi } from "vitest";
import { bundleTarget } from "../src/app-debug/bundle-target.js";
import { simulateApp } from "../src/app-debug/simulate.js";
import type { AppSimulationDeps } from "../src/app-debug/simulate.js";
import { parseApplicationBundle } from "@nodetool-ai/app-runtime";

const scriptDocument = {
  schemaVersion: 1,
  description: "",
  code: 'await output("shouted", String(inputs.text).toUpperCase());',
  inputs: [{ name: "text", type: "str" }],
  outputs: [{ name: "shouted", type: "str" }],
  packages: [],
  secrets: [],
  timeoutSeconds: 30,
  tests: []
};

const widgets = (binding: string) => [
  {
    type: "TextInput",
    props: { id: "TextInput-1", label: "Text", binding: "op:shout/in:text" }
  },
  {
    type: "Button",
    props: {
      id: "Button-1",
      label: "Run",
      events: [{ trigger: "click", kind: "run", operationId: "shout" }]
    }
  },
  { type: "Text", props: { id: "Text-1", binding } }
];

const bundle = (
  options: { binding?: string; scriptKey?: string; carry?: boolean } = {}
) => {
  const parsed = parseApplicationBundle({
    schemaVersion: 1,
    name: "Shouty",
    description: "",
    app: {
      schemaVersion: 4,
      ui: {
        root: { props: { title: "Shouty" } },
        content: widgets(options.binding ?? "op:shout/out:shouted"),
        zones: {}
      },
      operations: [
        {
          id: "shout",
          name: "Shout",
          workflowId: "",
          target: {
            kind: "script",
            scriptId: options.scriptKey ?? "shout-script",
            scriptVersion: 1
          },
          inputs: {},
          outputs: {},
          policy: "replace"
        }
      ],
      resources: [],
      variables: []
    },
    workflows: [],
    scripts:
      options.carry === false
        ? []
        : [
            {
              key: "shout-script",
              name: "Shout",
              document: scriptDocument
            }
          ]
  });
  if (!parsed) throw new Error("fixture is not a valid bundle");
  return bundleTarget(parsed, "bundle");
};

const stubRunScript = () =>
  vi.fn<NonNullable<AppSimulationDeps["runScript"]>>(async (input) => ({
    ok: true,
    outputs: {
      shouted: String(input.inputs.text ?? "").toUpperCase()
    },
    streamed: [],
    logs: [],
    duration_ms: 1
  }));

const run = async (
  target: ReturnType<typeof bundle>,
  deps: Partial<AppSimulationDeps> = {}
) => {
  const runScript = stubRunScript();
  const report = await simulateApp(
    target,
    { params: { text: "hello" } },
    {
      loadFromDb: async () => null,
      runOnServer: async () => {
        throw new Error("no workflow operation in this app");
      },
      runScript,
      ...deps
    }
  );
  return { report, runScript };
};

describe("app debug — script operations", () => {
  it("runs the pinned script and shows what it returned", async () => {
    const { report, runScript } = await run(bundle());

    expect(report.verdict.issues).toEqual([]);
    expect(report.verdict.ok).toBe(true);
    expect(runScript).toHaveBeenCalledTimes(1);
    expect(runScript.mock.calls[0][0].inputs).toEqual({ text: "hello" });
    expect(
      report.widgets.find((widget) => widget.id === "Text-1")?.value
    ).toBe("HELLO");
  });

  it("errors when a binding names a port the script does not declare", async () => {
    const { report } = await run(bundle({ binding: "op:shout/out:missing" }));

    expect(report.verdict.ok).toBe(false);
    expect(report.validation.errors.join(" ")).toContain("missing");
  });

  it("errors when the pinned script cannot be resolved", async () => {
    const { report } = await run(bundle({ carry: false }));

    expect(report.verdict.ok).toBe(false);
    expect(report.validation.errors.join(" ")).toContain("shout-script");
  });

  it("errors when the host cannot execute a script at all", async () => {
    const report = await simulateApp(
      bundle(),
      {},
      {
        loadFromDb: async () => null,
        runOnServer: async () => {
          throw new Error("unused");
        }
      }
    );

    expect(report.verdict.ok).toBe(false);
    expect(report.validation.errors.join(" ")).toContain("cannot execute");
  });

  it("reports a failing script run as a failed run", async () => {
    const { report } = await run(bundle(), {
      runScript: async () => ({
        ok: false,
        logs: ["about to fail"],
        error: "boom",
        duration_ms: 2
      })
    });

    expect(report.runs).toHaveLength(1);
    expect(report.runs[0].status).toBe("failed");
    expect(report.runs[0].error).toBe("boom");
    expect(report.verdict.ok).toBe(false);
  });
});
