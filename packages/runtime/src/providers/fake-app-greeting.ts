import type { ProviderTool, ToolCall } from "./types.js";

/** An explicit fixed fixture, never selected from the prompt's wording. */
export const FAKE_APP_GREETING_MODEL = "fake-app-greeting";

const GRAPH = {
  nodes: [
    {
      id: "name_in",
      type: "nodetool.input.StringInput",
      properties: { name: "name", value: "" }
    },
    {
      id: "wrap",
      type: "nodetool.code.Code",
      properties: {
        code: 'return { output: "Hello, " + inputs.text + "!" };',
        packages: []
      },
      dynamic_properties: { text: "" },
      dynamic_outputs: {
        output: { type: "any", type_args: [], optional: false }
      }
    },
    {
      id: "greeting_out",
      type: "nodetool.output.Output",
      properties: { name: "greeting" }
    }
  ],
  edges: [
    {
      id: "e1",
      source: "name_in",
      sourceHandle: "output",
      target: "wrap",
      targetHandle: "text"
    },
    {
      id: "e2",
      source: "wrap",
      sourceHandle: "output",
      target: "greeting_out",
      targetHandle: "value"
    }
  ]
};

const SPEC = {
  title: "Deterministic Greeting",
  operations: [
    {
      id: "greet",
      objective: "Return Hello, <name>! using a local text transformation",
      inputs: [{ name: "name", type: "string", example: "Ada" }],
      outputs: [{ name: "greeting", type: "string" }],
      streaming: false
    }
  ],
  variables: [],
  widgets: [
    {
      role: "name-input",
      type: "TextInput",
      binding: "op:greet/in:name",
      label: "Your name"
    },
    { role: "greet-button", type: "Button", binding: "", label: "Greet" },
    {
      role: "greeting-output",
      type: "Markdown",
      binding: "op:greet/out:greeting",
      label: "Greeting"
    }
  ],
  interactions: ["Ada", "Grace"].map((name) => ({
    name: `greet-${name.toLowerCase()}`,
    steps: [
      { set: { key: "name", value: name, operationId: "greet" } },
      { click: "greet-button" }
    ],
    expect: [
      { widget: "greeting-output", check: "equals", value: `Hello, ${name}!` }
    ]
  }))
};

/** Ordinary provider tool calls; every stage still validates and executes them. */
export function greetingFixtureCalls(
  tools: readonly ProviderTool[],
  callIdPrefix: string
): ToolCall[] {
  const call = (name: string, args: Record<string, unknown>): ToolCall => ({
    id: `${callIdPrefix}-${name}`,
    name,
    args
  });
  if (tools.some((tool) => tool.name === "finish_step")) {
    return [call("finish_step", { result: SPEC })];
  }
  if (tools.some((tool) => tool.name === "execute_code")) {
    return [
      call("execute_code", {
        title: "Build the fixed greeting workflow",
        risk: "low",
        code: `await finish(${JSON.stringify(GRAPH)});`
      })
    ];
  }
  if (tools.some((tool) => tool.name === "ui_app_finish")) {
    const application_id = "app-under-build";
    return [
      call("ui_app_add_operation", {
        application_id,
        id: "greet",
        name: "Greet",
        target_workflow_id: "wf-greet"
      }),
      ...[
        {
          type: "TextInput",
          props: { label: "Your name", binding: "op:greet/in:name_in" }
        },
        {
          type: "Markdown",
          props: { label: "Greeting", binding: "op:greet/out:greeting_out" }
        },
        {
          type: "Button",
          props: {
            label: "Greet",
            events: [{ trigger: "click", kind: "run", operationId: "greet" }]
          }
        }
      ].map((component, index) => ({
        ...call("ui_app_add_component", { application_id, ...component }),
        id: `${callIdPrefix}-component-${index}`
      })),
      call("ui_app_finish", {
        application_id,
        summary: "Fixed greeting fixture with two interaction tests"
      })
    ];
  }
  throw new Error(
    "fake-app-greeting supports app build only. Use --no-judge. It always builds the fixed greeting fixture, regardless of the prompt."
  );
}
