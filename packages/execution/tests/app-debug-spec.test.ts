/**
 * Tests for the app-debug spec layer (src/app-debug/app-spec.ts): parsing a
 * Puck app_doc into a flat widget list, extracting the graph's bindable
 * surface, and statically validating the wiring.
 */
import { describe, expect, it } from "vitest";
import {
  extractAppIO,
  operationSpec,
  parseAppSpec,
  validateApp,
  type AppContext
} from "../src/app-debug/app-spec.js";
import type { AppIO } from "../src/app-debug/types.js";
import type { DebugGraph } from "../src/debug/types.js";

const widget = (
  type: string,
  id: string,
  props: Record<string, unknown> = {}
) => ({ type, props: { id, ...props } });

const appDoc = (content: unknown[], title?: string) => ({
  version: 2,
  data: { root: { props: title ? { title } : {} }, content, zones: {} }
});

const graph = (nodes: Array<Record<string, unknown>>): DebugGraph => ({
  nodes,
  edges: []
});

const EMPTY_IO: AppIO = { inputs: [], outputs: [], variables: [], nodeIds: [] };

const demoIO = extractAppIO(
  graph([
    { id: "in1", type: "nodetool.input.StringInput", properties: { name: "prompt" } },
    { id: "in2", type: "nodetool.input.IntegerInput", properties: { name: "count" } },
    { id: "out1", type: "nodetool.output.StringOutput", properties: { name: "result" } },
    { id: "var1", type: "nodetool.variable.SetVariable", properties: { name: "dark" } }
  ])
);

describe("parseAppSpec", () => {
  it("rejects a missing app_doc with a clear issue", () => {
    const { spec, issues } = parseAppSpec(null, EMPTY_IO);
    expect(spec).toBeNull();
    expect(issues[0]).toMatch(/no app_doc/);
  });

  it("accepts a JSON-string app_doc", () => {
    const doc = JSON.stringify(appDoc([widget("Text", "Text-1")]));
    const { spec, issues } = parseAppSpec(doc, demoIO);
    expect(issues).toEqual([]);
    expect(spec?.widgets.map((w) => w.type)).toEqual(["Text"]);
  });

  it("flattens nested slot children with parent/slot attribution", () => {
    const doc = appDoc(
      [
        widget("Columns", "Columns-1", {
          left: [widget("TextInput", "TextInput-1", { binding: "prompt" })],
          right: [widget("Markdown", "Markdown-1", { binding: "result" })]
        }),
        widget("Button", "Button-1", {
          label: "Run",
          events: [{ trigger: "click", kind: "run", key: "", value: "" }]
        })
      ],
      "My App"
    );
    const { spec } = parseAppSpec(doc, demoIO);
    expect(spec?.title).toBe("My App");
    const byId = Object.fromEntries(spec!.widgets.map((w) => [w.id, w]));
    expect(Object.keys(byId)).toHaveLength(4);
    expect(byId["TextInput-1"]).toMatchObject({
      parentId: "Columns-1",
      slot: "left",
      bindingMode: "write",
      binding: "prompt",
      stateKey: "main:in1",
      canonicalBinding: "op:main/in:in1"
    });
    expect(byId["Markdown-1"]).toMatchObject({
      parentId: "Columns-1",
      slot: "right",
      bindingMode: "read"
    });
    expect(byId["Button-1"].events).toEqual([
      {
        trigger: "click",
        kind: "run",
        key: undefined,
        value: undefined,
        operationId: undefined,
        resourceBindingId: undefined,
        command: undefined
      }
    ]);
  });

  it("gives an unbound write widget its own view-scoped state key", () => {
    const { spec } = parseAppSpec(appDoc([widget("Slider", "Slider-9")]), demoIO);
    expect(spec?.widgets[0].stateKey).toBe("Slider-9:value");
  });

  it("flags an empty app", () => {
    const { spec, issues } = parseAppSpec(appDoc([]), EMPTY_IO);
    expect(spec?.widgets).toEqual([]);
    expect(issues.join(" ")).toMatch(/no widgets/);
  });
});

describe("extractAppIO", () => {
  it("extracts inputs, outputs, and variables from a kernel-shape graph", () => {
    const io = extractAppIO(
      graph([
        {
          id: "in1",
          type: "nodetool.input.StringInput",
          properties: { name: "prompt", value: "hello" }
        },
        { id: "out1", type: "nodetool.output.StringOutput", properties: { name: "result" } },
        { id: "prev", type: "nodetool.workflows.base_node.Preview", properties: {} },
        { id: "var1", type: "nodetool.variable.SetVariable", properties: { name: "dark" } },
        { id: "llm", type: "nodetool.agents.Agent", properties: {} }
      ])
    );
    expect(io.inputs).toEqual([
      {
        nodeId: "in1",
        nodeType: "nodetool.input.StringInput",
        name: "prompt",
        defaultValue: "hello"
      }
    ]);
    expect(io.outputs.map((o) => o.name)).toEqual(["result", "prev"]);
    expect(io.variables).toEqual(["dark"]);
  });
});

describe("validateApp", () => {
  const io = extractAppIO(
    graph([
      { id: "in1", type: "nodetool.input.StringInput", properties: { name: "prompt" } },
      { id: "out1", type: "nodetool.output.StringOutput", properties: { name: "result" } },
      { id: "var1", type: "nodetool.variable.SetVariable", properties: { name: "dark" } }
    ])
  );

  it("passes a correctly wired app", () => {
    const { spec } = parseAppSpec(
      appDoc([
        widget("TextInput", "TextInput-1", { binding: "prompt" }),
        widget("Markdown", "Markdown-1", { binding: "result" }),
        widget("Progress", "Progress-1", { binding: "op:main/exec#progress" }),
        widget("Alert", "Alert-1", { binding: "op:main/exec#error" }),
        widget("Button", "Button-1", {
          disabledWhen: { binding: "op:main/exec#running" },
          events: [{ trigger: "click", kind: "run" }]
        })
      ]),
      io
    );
    const result = validateApp(spec!, io);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("does not treat unsupported event fields as a runnable click", () => {
    const { spec } = parseAppSpec(
      appDoc([
        widget("Button", "Button-1", {
          events: [{ event: "click", action: "run", operationId: "main" }]
        })
      ]),
      io
    );

    const result = validateApp(spec!, io);
    expect(result.errors).toContain(
      'No widget has a "run" event — the app can never execute the workflow. Add a Run button or an on-change run.'
    );
  });

  it("accepts a form that renders the default operation's inputs", () => {
    const { spec } = parseAppSpec(
      appDoc([
        widget("WorkflowForm", "WorkflowForm-1", {}),
        widget("Markdown", "Markdown-1", { binding: "result" }),
        widget("Button", "Button-1", {
          events: [{ trigger: "click", kind: "run" }]
        })
      ]),
      io
    );
    const result = validateApp(spec!, io);
    expect(result.errors).toEqual([]);
    // A form binds no slot of its own, so the unbound-write warning every other
    // write widget earns must not fire for it.
    expect(result.warnings.join("\n")).not.toMatch(/local UI state/);
  });

  it("flags a form whose operation the app never declares", () => {
    const { spec } = parseAppSpec(
      appDoc([
        widget("WorkflowForm", "WorkflowForm-1", { operationId: "renamed" }),
        widget("Button", "Button-1", {
          events: [{ trigger: "click", kind: "run" }]
        })
      ]),
      io
    );
    const { errors } = validateApp(spec!, io);
    expect(errors.join("\n")).toMatch(
      /renders the inputs of operation "renamed" but the app declares no such operation/
    );
  });

  it("flags bindings that reference missing inputs/outputs/variables", () => {
    const { spec } = parseAppSpec(
      appDoc([
        widget("TextInput", "TextInput-1", { binding: "nope" }),
        widget("Markdown", "Markdown-1", { binding: "missing" }),
        widget("Button", "Button-1", {
          events: [
            { trigger: "click", kind: "run" },
            { trigger: "click", kind: "toggleState", key: "ghost" }
          ]
        })
      ]),
      io
    );
    const { errors } = validateApp(spec!, io);
    expect(errors.join("\n")).toMatch(/no input node or node property/);
    expect(errors.join("\n")).toMatch(/no output or variable/);
    expect(errors.join("\n")).toMatch(/no SetVariable node/);
  });

  it("resolves and validates a chat app's second binding", () => {
    const ok = parseAppSpec(
      appDoc([
        widget("ChatThread", "ChatThread-1", {
          binding: "dark",
          streamBinding: "result"
        }),
        widget("ChatComposer", "ChatComposer-1", {
          binding: "prompt",
          historyBinding: "dark",
          events: [{ trigger: "click", kind: "run" }]
        })
      ]),
      io
    ).spec!;
    expect(ok.widgets[0].extraBindings[0]).toMatchObject({
      prop: "streamBinding",
      binding: "result"
    });
    // The thread displays the output through streamBinding, so nothing warns
    // that the workflow's output goes unshown. The composer is unguarded and
    // the app shows neither progress nor errors, which is what the rest warns
    // about — the binding check itself is silent.
    const chat = validateApp(ok, io);
    expect(chat.errors).toEqual([]);
    expect(chat.warnings.join("\n")).not.toMatch(/not displayed/);

    const broken = parseAppSpec(
      appDoc([
        widget("ChatThread", "ChatThread-1", {
          binding: "dark",
          streamBinding: "ghost"
        }),
        widget("Button", "Button-1", { events: [{ trigger: "click", kind: "run" }] })
      ]),
      io
    ).spec!;
    expect(validateApp(broken, io).errors.join("\n")).toMatch(
      /streamBinding is bound to "ghost"/
    );
  });

  it("flags an app that can never run and warns on undisplayed outputs", () => {
    const { spec } = parseAppSpec(
      appDoc([widget("TextInput", "TextInput-1", { binding: "prompt" })]),
      io
    );
    const { errors, warnings } = validateApp(spec!, io);
    expect(errors.join("\n")).toMatch(/never execute the workflow/);
    expect(warnings.join("\n")).toMatch(/"result" is not displayed/);
  });

  it("accepts every display widget in the shared catalog, including Table", () => {
    const { spec } = parseAppSpec(
      appDoc([
        widget("Table", "Table-1", { binding: "result" }),
        widget("Button", "Button-1", { events: [{ trigger: "click", kind: "run" }] })
      ]),
      io
    );
    expect(spec?.widgets[0].bindingMode).toBe("read");
    expect(validateApp(spec!, io).errors).toEqual([]);
  });

  it("flags unknown widget types", () => {
    const { spec } = parseAppSpec(appDoc([widget("Bogus", "Bogus-1")]), io);
    const { errors } = validateApp(spec!, io);
    expect(errors.join("\n")).toMatch(/unknown widget type/);
  });

  it("flags operation mappings keyed on nodes the workflow does not have", () => {
    const context: AppContext = {
      defaultOperationId: "main",
      variables: [],
      resources: [],
      operations: [
        operationSpec(
          {
            id: "main",
            name: "Run",
            workflowId: "wf1",
            inputs: { ghostIn: { from: "widget" }, in1: { from: "constant", value: undefined } },
            outputs: { ghostOut: { to: "display" } },
            policy: "replace"
          },
          io,
          null
        )
      ]
    };
    const { spec } = parseAppSpec(
      appDoc([
        widget("Markdown", "Markdown-1", { binding: "result" }),
        widget("Button", "Button-1", { events: [{ trigger: "click", kind: "run" }] })
      ]),
      io,
      context
    );
    const { errors, warnings } = validateApp(spec!, io, context);
    expect(errors.join("\n")).toMatch(/input mapping for node "ghostIn"/);
    expect(errors.join("\n")).toMatch(/output mapping for node "ghostOut"/);
    expect(warnings.join("\n")).toMatch(/constant with no value/);
  });

  it("flags a resource widget whose collection the app never declares", () => {
    const doc = {
      schemaVersion: 3,
      ui: { root: { props: {} }, content: [
        widget("ResourceGallery", "ResourceGallery-1", {
          resourceBindingId: "shots"
        }),
        widget("Button", "Button-1", { events: [{ trigger: "click", kind: "run" }] })
      ], zones: {} },
      operations: [],
      variables: [],
      resources: []
    };
    const { spec } = parseAppSpec(doc, io);
    expect(spec?.widgets[0].resourceBindingId).toBe("shots");
    const { errors, warnings } = validateApp(spec!, io);
    expect(errors.join("\n")).toMatch(/no such resource binding/);
    // Its value is not app state, so the local-UI-state warning must not fire.
    expect(warnings.join("\n")).not.toMatch(/local UI state/);
  });

  it("flags a resource widget with no collection selected at all", () => {
    const doc = {
      schemaVersion: 3,
      ui: { root: { props: {} }, content: [
        widget("ResourcePicker", "ResourcePicker-1", { resourceBindingId: "" }),
        widget("Button", "Button-1", { events: [{ trigger: "click", kind: "run" }] })
      ], zones: {} },
      operations: [],
      variables: [],
      resources: []
    };
    const { spec } = parseAppSpec(doc, io);
    const { errors } = validateApp(spec!, io);
    expect(errors.join("\n")).toMatch(/no resource binding selected/);
  });

  it("accepts a resource widget bound to a declared collection", () => {
    const doc = {
      schemaVersion: 3,
      ui: { root: { props: {} }, content: [
        widget("StoryboardSceneList", "StoryboardSceneList-1", {
          resourceBindingId: "board"
        }),
        widget("Button", "Button-1", { events: [{ trigger: "click", kind: "run" }] })
      ], zones: {} },
      operations: [],
      variables: [],
      resources: [
        {
          id: "board",
          name: "Board",
          kind: "storyboard",
          scope: { projectId: "p1" },
          operations: []
        }
      ]
    };
    const { spec } = parseAppSpec(doc, io);
    expect(validateApp(spec!, io).errors).toEqual([]);
  });

  it("warns on an unbound write widget (local-only state)", () => {
    const { spec } = parseAppSpec(
      appDoc([
        widget("Switch", "Switch-1"),
        widget("Button", "Button-1", { events: [{ trigger: "click", kind: "run" }] }),
        widget("Markdown", "Markdown-1", { binding: "result" })
      ]),
      io
    );
    const { warnings } = validateApp(spec!, io);
    expect(warnings.join("\n")).toMatch(/local UI state/);
  });



  it("warns that an unguarded run button lets a second click restart the job", () => {
    const context: AppContext = {
      defaultOperationId: "main",
      variables: [],
      resources: [],
      operations: [
        operationSpec(
          {
            id: "main",
            name: "Run",
            workflowId: "wf1",
            inputs: {},
            outputs: {},
            policy: "replace"
          },
          io,
          null
        )
      ]
    };
    const { spec } = parseAppSpec(
      appDoc([
        widget("Markdown", "Markdown-1", { binding: "result" }),
        widget("Button", "Button-1", {
          events: [{ trigger: "click", kind: "run" }]
        })
      ]),
      io,
      context
    );
    const { warnings } = validateApp(spec!, io, context);
    expect(warnings.join("\n")).toMatch(
      /Button "Button-1" runs operation "main" but has no disabledWhen on its running state — a second click cancels the running job and starts it again/
    );
  });

  it("accepts a run button guarded on the operation's running state", () => {
    const { spec } = parseAppSpec(
      appDoc([
        widget("Markdown", "Markdown-1", { binding: "result" }),
        widget("Button", "Button-1", {
          disabledWhen: { binding: "op:main/exec#running" },
          events: [{ trigger: "click", kind: "run" }]
        })
      ]),
      io
    );
    expect(validateApp(spec!, io).warnings.join("\n")).not.toMatch(
      /no disabledWhen on its running state/
    );
  });

  it("warns when nothing shows an operation's errors or progress", () => {
    const { spec } = parseAppSpec(
      appDoc([
        widget("Markdown", "Markdown-1", { binding: "result" }),
        widget("Button", "Button-1", {
          events: [{ trigger: "click", kind: "run" }]
        })
      ]),
      io
    );
    const { warnings } = validateApp(spec!, io);
    expect(warnings.join("\n")).toMatch(
      /No widget shows the error state of operation "main"/
    );
    expect(warnings.join("\n")).toMatch(
      /No widget shows the progress of operation "main"/
    );
  });

  it("counts an activity binding as progress feedback", () => {
    const { spec } = parseAppSpec(
      appDoc([
        widget("Text", "Text-1", { binding: "op:main/exec#activity" }),
        widget("Alert", "Alert-1", { binding: "op:main/exec#error" }),
        widget("Markdown", "Markdown-1", { binding: "result" }),
        widget("Button", "Button-1", {
          events: [{ trigger: "click", kind: "run" }]
        })
      ]),
      io
    );
    const joined = validateApp(spec!, io).warnings.join("\n");
    expect(joined).not.toMatch(/shows the progress of operation/);
    expect(joined).not.toMatch(/shows the error state of operation/);
  });

  describe("media inputs a run can start without", () => {
    const mediaIO = extractAppIO(
      graph([
        {
          id: "img",
          type: "nodetool.input.ImageInput",
          properties: { name: "sketch" }
        },
        {
          id: "out1",
          type: "nodetool.output.ImageOutput",
          properties: { name: "picture" }
        }
      ])
    );

    it("warns when nothing guards the run against an empty pad", () => {
      const { spec } = parseAppSpec(
        appDoc([
          widget("SketchPad", "SketchPad-1", { binding: "sketch" }),
          widget("Image", "Image-1", { binding: "picture" }),
          widget("Button", "Button-1", {
            events: [{ trigger: "click", kind: "run" }]
          })
        ]),
        mediaIO
      );
      const { warnings } = validateApp(spec!, mediaIO);
      expect(warnings.join("\n")).toMatch(
        /SketchPad "SketchPad-1" fills input "sketch" of operation "main", which has no default/
      );
    });

    it("accepts a run guarded on the media binding", () => {
      const { spec } = parseAppSpec(
        appDoc([
          widget("SketchPad", "SketchPad-1", { binding: "sketch" }),
          widget("Image", "Image-1", { binding: "picture" }),
          widget("Button", "Button-1", {
            disabledWhen: { binding: "sketch", op: "falsy" },
            events: [{ trigger: "click", kind: "run" }]
          })
        ]),
        mediaIO
      );
      expect(validateApp(spec!, mediaIO).warnings.join("\n")).not.toMatch(
        /which has no default/
      );
    });

    it("follows a variable mapping from the picker to the operation input", () => {
      const context: AppContext = {
        defaultOperationId: "main",
        variables: [
          { id: "photo", name: "photo", scope: "instance", persist: false }
        ],
        resources: [],
        operations: [
          operationSpec(
            {
              id: "main",
              name: "Run",
              workflowId: "wf1",
              inputs: { img: { from: "variable", variableId: "photo" } },
              outputs: {},
              policy: "replace"
            },
            mediaIO,
            null
          )
        ]
      };
      const { spec } = parseAppSpec(
        appDoc([
          widget("ImageInput", "ImageInput-1", { binding: "var:photo" }),
          widget("Image", "Image-1", { binding: "picture" }),
          widget("Button", "Button-1", {
            events: [{ trigger: "click", kind: "run" }]
          })
        ]),
        mediaIO,
        context
      );
      const { warnings } = validateApp(spec!, mediaIO, context);
      expect(warnings.join("\n")).toMatch(
        /ImageInput "ImageInput-1" fills input "sketch" of operation "main", which has no default/
      );
    });

    it("stays quiet when the variable behind the mapping has a default", () => {
      const context: AppContext = {
        defaultOperationId: "main",
        variables: [
          {
            id: "photo",
            name: "photo",
            scope: "instance",
            persist: false,
            default: { type: "image", uri: "asset://seed.png" }
          }
        ],
        resources: [],
        operations: [
          operationSpec(
            {
              id: "main",
              name: "Run",
              workflowId: "wf1",
              inputs: { img: { from: "variable", variableId: "photo" } },
              outputs: {},
              policy: "replace"
            },
            mediaIO,
            null
          )
        ]
      };
      const { spec } = parseAppSpec(
        appDoc([
          widget("ImageInput", "ImageInput-1", { binding: "var:photo" }),
          widget("Image", "Image-1", { binding: "picture" }),
          widget("Button", "Button-1", {
            events: [{ trigger: "click", kind: "run" }]
          })
        ]),
        mediaIO,
        context
      );
      expect(
        validateApp(spec!, mediaIO, context).warnings.join("\n")
      ).not.toMatch(/which has no default/);
    });

    it("covers the capture widgets, which hold nothing until the user shoots", () => {
      for (const type of ["CameraCapture", "AudioRecorder"]) {
        const { spec } = parseAppSpec(
          appDoc([
            widget(type, `${type}-1`, { binding: "sketch" }),
            widget("Image", "Image-1", { binding: "picture" }),
            widget("Button", "Button-1", {
              events: [{ trigger: "click", kind: "run" }]
            })
          ]),
          mediaIO
        );
        expect(validateApp(spec!, mediaIO).warnings.join("\n")).toMatch(
          new RegExp(`${type} "${type}-1" fills input "sketch"`)
        );
      }
    });

    it("leaves a Workflow Form alone — it binds no single input to guard", () => {
      const { spec } = parseAppSpec(
        appDoc([
          widget("WorkflowForm", "WorkflowForm-1", {}),
          widget("Image", "Image-1", { binding: "picture" }),
          widget("Button", "Button-1", {
            events: [{ trigger: "click", kind: "run" }]
          })
        ]),
        mediaIO
      );
      expect(validateApp(spec!, mediaIO).warnings.join("\n")).not.toMatch(
        /which has no default/
      );
    });

    it("stays quiet when the input node ships a default image", () => {
      const withDefault = extractAppIO(
        graph([
          {
            id: "img",
            type: "nodetool.input.ImageInput",
            properties: {
              name: "sketch",
              value: { type: "image", uri: "asset://seed.png" }
            }
          },
          {
            id: "out1",
            type: "nodetool.output.ImageOutput",
            properties: { name: "picture" }
          }
        ])
      );
      const { spec } = parseAppSpec(
        appDoc([
          widget("ImageInput", "ImageInput-1", { binding: "sketch" }),
          widget("Image", "Image-1", { binding: "picture" }),
          widget("Button", "Button-1", {
            events: [{ trigger: "click", kind: "run" }]
          })
        ]),
        withDefault
      );
      expect(validateApp(spec!, withDefault).warnings.join("\n")).not.toMatch(
        /which has no default/
      );
    });
  });
});
