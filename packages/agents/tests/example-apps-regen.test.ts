/**
 * The example-apps regeneration check (`build-example-apps.mjs --regen`).
 *
 * The derivation and the diff are the parts that can be wrong without a model:
 * a spec that does not describe the shipped app, or a diff that calls two
 * builds of one app different because their widget ids differ. Both are pinned
 * here, the derivation against a real shipped bundle.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bindingToSpec,
  diffBundles,
  flattenWidgets,
  specFromBundle,
  summarizeBundle
} from "../../../scripts/example-apps/regen.mjs";
import { validateBuildSpec, parseBuildSpec } from "../src/app-build/spec.js";

const APPS = join(
  __dirname,
  "../../base-nodes/nodetool/examples/apps"
);

/** A two-operation app: one variable, one display, one property-bound slider. */
const bundle = () => ({
  schemaVersion: 1,
  name: "Drafter",
  description: "drafts and approves",
  app: {
    schemaVersion: 3,
    ui: {
      root: { props: { title: "Drafter" } },
      content: [
        {
          type: "Columns",
          props: {
            id: "cols",
            left: [
              {
                type: "Container",
                props: {
                  id: "panel",
                  content: [
                    {
                      type: "TextInput",
                      props: {
                        id: "in-prompt",
                        binding: "op:draft/in:n-prompt",
                        label: "Prompt"
                      }
                    },
                    {
                      type: "Slider",
                      props: {
                        id: "slider",
                        binding: "op:draft/prop:llm#temperature",
                        label: "Heat"
                      }
                    },
                    {
                      type: "Button",
                      props: {
                        id: "btn",
                        label: "Draft",
                        events: [
                          { trigger: "click", kind: "run", operationId: "draft" }
                        ]
                      }
                    }
                  ]
                }
              }
            ],
            right: [
              {
                type: "Markdown",
                props: {
                  id: "out-draft",
                  binding: "op:draft/out:n-text",
                  label: "Draft"
                }
              }
            ]
          }
        }
      ],
      zones: {}
    },
    operations: [
      {
        id: "draft",
        name: "Draft",
        workflowId: "wf-draft",
        inputs: {},
        outputs: { "n-text": { to: "variable", variableId: "draft" } },
        policy: "replace"
      }
    ],
    resources: [],
    variables: [
      { id: "draft", name: "Draft", scope: "app", persist: false }
    ]
  },
  workflows: [
    {
      key: "wf-draft",
      name: "draft",
      description: "Write a draft from a prompt",
      graph: {
        nodes: [
          {
            id: "n-prompt",
            type: "nodetool.input.StringInput",
            data: { name: "prompt", value: "a haiku" }
          },
          {
            id: "n-text",
            type: "nodetool.output.StringOutput",
            data: { name: "text" }
          }
        ],
        edges: []
      }
    }
  ]
});

describe("flattenWidgets", () => {
  it("walks every layout slot", () => {
    expect(flattenWidgets(bundle().app).map((w: { id: string }) => w.id)).toEqual([
      "cols",
      "panel",
      "in-prompt",
      "slider",
      "btn",
      "out-draft"
    ]);
  });

  it("records the container each widget sits in", () => {
    const widgets = flattenWidgets(bundle().app) as Array<{
      id: string;
      container?: string;
    }>;
    expect(widgets.find((w) => w.id === "in-prompt")?.container).toBe("panel");
    expect(widgets.find((w) => w.id === "cols")?.container).toBeUndefined();
  });
});

describe("specFromBundle", () => {
  it("describes the shipped app in the spec's name vocabulary", () => {
    const { spec, dropped } = specFromBundle(bundle());
    expect(spec.title).toBe("Drafter");
    expect(spec.operations).toEqual([
      {
        id: "draft",
        objective: "Write a draft from a prompt",
        inputs: [{ name: "prompt", type: "stringinput", example: "a haiku" }],
        outputs: [{ name: "text", type: "any" }],
        streaming: false
      }
    ]);
    // Node ids never leave the bundle: a spec binds by name.
    expect(
      spec.widgets.find((w: { role: string }) => w.role === "out-draft")?.binding
    ).toBe("op:draft/out:text");
    expect(dropped.map((w: { id: string }) => w.id)).toEqual(["slider"]);
  });

  it("declares one interaction per operation that runs it and expects its outputs", () => {
    const { spec } = specFromBundle(bundle());
    expect(spec.interactions).toEqual([
      {
        name: "draft",
        steps: [
          { set: { key: "prompt", value: "a haiku", operationId: "draft" } },
          { run: "draft" }
        ],
        expect: [{ widget: "out-draft", check: "nonEmpty" }]
      }
    ]);
  });

  it("attributes each variable to the operation that writes it", () => {
    const { spec } = specFromBundle(bundle());
    expect(spec.variables).toEqual([
      {
        id: "draft",
        scope: "app",
        persist: false,
        writtenBy: "draft",
        readBy: []
      }
    ]);
  });

  it("leaves an untranslatable binding alone", () => {
    expect(bindingToSpec("var:draft", new Map())).toBe("var:draft");
  });
});

describe("diffBundles", () => {
  it("reports no drift for a rebuild that only renamed widget ids", () => {
    const rebuilt = bundle();
    rebuilt.app.ui.content[0].props.right[0].props.id = "markdown-1";
    expect(diffBundles(bundle(), rebuilt)).toEqual([]);
  });

  it("names a widget the rebuild dropped and one it added", () => {
    const rebuilt = bundle();
    rebuilt.app.ui.content[0].props.right[0].props.type = undefined;
    rebuilt.app.ui.content[0].props.right = [
      {
        type: "Json",
        props: { id: "out-draft", binding: "op:draft/out:n-text", label: "Draft" }
      }
    ];
    const lines = diffBundles(bundle(), rebuilt);
    expect(lines).toContain('  - missing widget: Markdown op:draft/out:text ("Draft")');
    expect(lines).toContain('  + extra widget: Json op:draft/out:text ("Draft")');
  });

  it("reports operation, variable, and workflow drift", () => {
    const rebuilt = bundle();
    rebuilt.app.operations[0].policy = "queue";
    rebuilt.app.operations[0].outputs = {};
    rebuilt.app.variables[0].scope = "instance";
    rebuilt.workflows = [];
    const lines = diffBundles(bundle(), rebuilt).join("\n");
    expect(lines).toContain("operation draft: policy replace → queue");
    expect(lines).toContain("operation draft: writes [draft] → []");
    expect(lines).toContain("variable draft: app/persist=false → instance/persist=false");
    expect(lines).toContain("workflows carried: 1 → 0");
  });

  it("compares widgets on what they show, not what they are called", () => {
    expect(summarizeBundle(bundle()).widgets).toContain(
      'Markdown op:draft/out:text ("Draft")'
    );
  });
});

describe("a spec derived from a shipped bundle", () => {
  it("is a valid BuildSpec for every shipped app", async () => {
    const files = (await readdir(APPS)).filter((f) => f.endsWith(".app.json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const shipped = JSON.parse(await readFile(join(APPS, file), "utf8"));
      const { spec } = specFromBundle(shipped);
      expect(parseBuildSpec(spec).issues, file).toEqual([]);
      expect(validateBuildSpec(spec), file).toEqual([]);
    }
  });
});
