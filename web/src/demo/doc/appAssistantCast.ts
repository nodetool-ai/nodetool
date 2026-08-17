/**
 * "Build a mini app with the assistant" tutorial cast.
 *
 * The App Assistant is asked for a one-button headline writer: it declares the
 * operation (`ui_app_add_operation`) and a persisted variable
 * (`ui_app_declare_variable`), then places the widgets
 * (`ui_app_add_component`) — heading, input, button, output — so the app grows
 * a control at a time in the real `AppRuntimeView`.
 *
 * Backend-free: the bound workflow is a two-node graph that never runs on
 * replay; the app is shown being assembled, not executed.
 */
import { APP_SCHEMA_VERSION } from "@nodetool-ai/app-runtime";

import { PROVIDER_IDS, type Workflow } from "../../stores/ApiTypes";
import {
  assistantStart,
  assistantStream,
  status,
  toolResult,
  toolRunning,
  userMessage
} from "../chat/chatCastHelpers";
import { edge, node } from "../castHelpers";
import { patch } from "./docCastHelpers";
import {
  DOC_CAST_VERSION,
  type AppCastDoc,
  type AppDocCast
} from "./docCastTypes";

const ASSISTANT_ID = "app-assistant-1";
const OP_CALL = "app-call-add-operation";
const VAR_CALL = "app-call-declare-variable";
const UI_CALL = "app-call-add-components";

const WORKFLOW_ID = "demo-app-workflow";

/** The graph the app's one operation binds: a topic in, a headline out. */
const workflow: Workflow = {
  id: WORKFLOW_ID,
  name: "Headline writer",
  access: "private",
  description: "Turn a topic into a headline.",
  thumbnail: "",
  tags: [],
  run_mode: "workflow",
  settings: {},
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
  graph: {
    nodes: [
      node("topic_input", "nodetool.input.StringInput", 0, 0, 240, "Topic", {
        name: "topic_input",
        value: ""
      }),
      node("write", "nodetool.agents.Agent", 320, 0, 280, "Write", {
        prompt: "Write one punchy headline about the topic."
      }),
      node(
        "headline",
        "nodetool.output.StringOutput",
        700,
        0,
        240,
        "Headline",
        { name: "headline" }
      )
    ],
    edges: [
      edge("a1", "topic_input", "output", "write", "prompt"),
      edge("a2", "write", "text", "headline", "value")
    ]
  }
};

const heading = {
  type: "Heading",
  props: { id: "title", text: "Headline Writer", level: "1" }
};
const input = {
  type: "TextInput",
  props: {
    id: "in-topic",
    binding: "var:topic",
    label: "What's it about?",
    events: []
  }
};
const button = {
  type: "Button",
  props: {
    id: "btn-run",
    label: "Write it",
    variant: "contained",
    color: "primary",
    events: [{ trigger: "click", kind: "run", operationId: "write" }]
  }
};
const output = {
  type: "Text",
  props: { id: "out-headline", binding: "op:write/out:headline" }
};

const operation = {
  id: "write",
  name: "Write",
  workflowId: WORKFLOW_ID,
  inputs: { topic_input: { from: "variable" as const, variableId: "topic" } },
  outputs: {},
  policy: "replace" as const
};

const variable = {
  id: "topic",
  name: "Topic",
  type: { type: "str", optional: true },
  default: "the James Webb telescope",
  scope: "user" as const,
  persist: true
};

/** The app document with `content` as the widgets placed so far. */
const appDoc = (
  content: unknown[],
  operations: unknown[],
  variables: unknown[]
): AppCastDoc => ({
  workflow,
  document: {
    schemaVersion: APP_SCHEMA_VERSION,
    ui: {
      root: { props: { title: "Headline Writer" } },
      content,
      zones: {}
    },
    operations,
    resources: [],
    variables
  } as AppCastDoc["document"]
});

const ANSWER = [
  "One operation, one persisted topic, ",
  "four widgets. ",
  "Press Write it and the headline ",
  "lands under the button."
];

export const appAssistantCast: AppDocCast = {
  version: DOC_CAST_VERSION,
  kind: "doc",
  surface: "app",
  id: "app-assistant",
  name: "Build a mini app with the assistant",
  description:
    "Ask the App Assistant for a one-button app: it binds the workflow, declares a setting, and places the widgets.",
  createdAt: new Date(0).toISOString(),
  durationMs: 20000,
  fps: 30,
  docId: "demo-app-1",
  assistantTitle: "App Assistant",
  assistantModel: {
    type: "language_model",
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: PROVIDER_IDS.ANTHROPIC
  },

  doc: appDoc([], [], []),

  events: [
    // The operation and the variable come first — a widget binds to them.
    patch(4400, appDoc([], [operation], [variable])),
    // Then the widgets, in the order the assistant places them.
    patch(8600, appDoc([heading, input], [operation], [variable])),
    patch(11400, appDoc([heading, input, button], [operation], [variable])),
    patch(14000, appDoc([heading, input, button, output], [operation], [variable]))
  ],

  assistant: [
    status(0, "connected"),
    userMessage(
      400,
      "Make me an app: type a topic, press a button, get a headline back."
    ),
    status(900, "streaming"),

    assistantStart(1600, ASSISTANT_ID, [
      {
        id: OP_CALL,
        name: "ui_app_add_operation",
        args: { id: "write", workflowId: WORKFLOW_ID }
      }
    ]),
    toolRunning(1800, OP_CALL, "Binding the workflow…"),
    toolRunning(4200, null),
    toolResult(4400, ASSISTANT_ID, [
      {
        id: OP_CALL,
        name: "ui_app_add_operation",
        args: { id: "write", workflowId: WORKFLOW_ID },
        result: { operationId: "write" }
      },
      {
        id: VAR_CALL,
        name: "ui_app_declare_variable",
        args: { id: "topic", scope: "user", persist: true }
      }
    ]),
    toolRunning(5000, VAR_CALL, "Declaring a setting…"),
    toolRunning(8400, null),
    toolResult(8600, ASSISTANT_ID, [
      {
        id: VAR_CALL,
        name: "ui_app_declare_variable",
        args: { id: "topic", scope: "user", persist: true },
        result: { variableId: "topic" }
      },
      {
        id: UI_CALL,
        name: "ui_app_add_component",
        args: { types: ["Heading", "TextInput", "Button", "Text"] }
      }
    ]),
    toolRunning(9200, UI_CALL, "Placing widgets…"),
    toolRunning(13800, null),
    toolResult(14000, ASSISTANT_ID, [
      {
        id: OP_CALL,
        name: "ui_app_add_operation",
        args: { id: "write", workflowId: WORKFLOW_ID },
        result: { operationId: "write" }
      },
      {
        id: VAR_CALL,
        name: "ui_app_declare_variable",
        args: { id: "topic", scope: "user", persist: true },
        result: { variableId: "topic" }
      },
      {
        id: UI_CALL,
        name: "ui_app_add_component",
        args: { types: ["Heading", "TextInput", "Button", "Text"] },
        result: { componentIds: ["title", "in-topic", "btn-run", "out-headline"] }
      }
    ]),

    ...assistantStream(ASSISTANT_ID, ANSWER, 14600, 3600),
    status(18400, "connected")
  ]
};
