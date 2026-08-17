/**
 * "Write a JS script with the assistant" tutorial cast.
 *
 * The JS Script Assistant is asked for a CSV-to-totals script: it declares the
 * ports (`ui_jsscript_set_ports`), writes the body (`ui_jsscript_set_code`),
 * and grades it against the saved cases (`ui_jsscript_test`). The body appears
 * in the real editor pane a revision at a time.
 *
 * Backend-free: no sandbox runs on replay — the test result is part of the
 * cast, the same way a generated image is.
 */
import { PROVIDER_IDS } from "../../stores/ApiTypes";
import {
  assistantStart,
  assistantStream,
  status,
  toolResult,
  toolRunning,
  userMessage
} from "../chat/chatCastHelpers";
import { patch } from "./docCastHelpers";
import {
  DOC_CAST_VERSION,
  type JsScriptCastDoc,
  type JsScriptDocCast
} from "./docCastTypes";

const ASSISTANT_ID = "jsscript-assistant-1";
const PORTS_CALL = "jsscript-call-ports";
const CODE_CALL = "jsscript-call-code";
const TEST_CALL = "jsscript-call-test";

const NAME = "Sum a CSV column";

const EMPTY: JsScriptCastDoc = {
  name: NAME,
  document: {
    schemaVersion: 1,
    description: "",
    code: "",
    inputs: [],
    outputs: [],
    packages: [],
    secrets: [],
    timeoutSeconds: 30,
    tests: []
  }
};

const PORTS = {
  inputs: [
    { name: "csv", type: "str" },
    { name: "column", type: "str" }
  ],
  outputs: [{ name: "total", type: "float" }]
};

const CODE = `import { parse } from "@nodetool-ai/sandbox-csv";

const { data } = parse(inputs.csv, { header: true });
const total = data.reduce(
  (sum, row) => sum + Number(row[inputs.column] ?? 0),
  0
);
await output("total", total);
`;

const TESTS = [
  {
    name: "sums the amount column",
    inputs: {
      csv: "item,amount\\npens,3\\npaper,4.5\\n",
      column: "amount"
    },
    expect: { total: 7.5 }
  }
];

const withPorts: JsScriptCastDoc = {
  name: NAME,
  document: {
    ...EMPTY.document,
    description: "Sum one numeric column of a CSV.",
    inputs: PORTS.inputs,
    outputs: PORTS.outputs
  }
};

const withCode: JsScriptCastDoc = {
  name: NAME,
  document: {
    ...withPorts.document,
    code: CODE,
    packages: [{ specifier: "@nodetool-ai/sandbox-csv" }]
  }
};

const withTests: JsScriptCastDoc = {
  name: NAME,
  document: { ...withCode.document, tests: TESTS }
};

const ANSWER = [
  "Two inputs, one output, ",
  "parsed with the csv pack. ",
  "The saved case passes — ",
  "7.5 out of the amount column."
];

export const jsScriptAssistantCast: JsScriptDocCast = {
  version: DOC_CAST_VERSION,
  kind: "doc",
  surface: "jsscript",
  id: "jsscript-assistant",
  name: "Write a JS script with the assistant",
  description:
    "Ask the JS Script Assistant for a CSV total: it declares the ports, writes the body, and grades it against a saved test.",
  createdAt: new Date(0).toISOString(),
  durationMs: 20000,
  fps: 30,
  docId: "demo-jsscript-1",
  assistantTitle: "JS Script Assistant",
  assistantModel: {
    type: "language_model",
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: PROVIDER_IDS.ANTHROPIC
  },

  doc: EMPTY,

  events: [
    patch(4200, withPorts),
    patch(9000, withCode),
    patch(13600, withTests)
  ],

  assistant: [
    status(0, "connected"),
    userMessage(
      400,
      "Write a script that takes a CSV and a column name and returns that column's total."
    ),
    status(900, "streaming"),

    assistantStart(1500, ASSISTANT_ID, [
      {
        id: PORTS_CALL,
        name: "ui_jsscript_set_ports",
        args: PORTS
      }
    ]),
    toolRunning(1700, PORTS_CALL, "Declaring ports…"),
    toolRunning(4000, null),
    toolResult(4200, ASSISTANT_ID, [
      { id: PORTS_CALL, name: "ui_jsscript_set_ports", args: PORTS, result: { ok: true } },
      {
        id: CODE_CALL,
        name: "ui_jsscript_set_code",
        args: { packages: ["@nodetool-ai/sandbox-csv"] }
      }
    ]),
    toolRunning(4800, CODE_CALL, "Writing the body…"),
    toolRunning(8800, null),
    toolResult(9000, ASSISTANT_ID, [
      {
        id: CODE_CALL,
        name: "ui_jsscript_set_code",
        args: { packages: ["@nodetool-ai/sandbox-csv"] },
        result: { issues: [] }
      },
      { id: TEST_CALL, name: "ui_jsscript_test", args: { cases: TESTS } }
    ]),
    toolRunning(9600, TEST_CALL, "Running the saved case…"),
    toolRunning(13400, null),
    toolResult(13600, ASSISTANT_ID, [
      { id: PORTS_CALL, name: "ui_jsscript_set_ports", args: PORTS, result: { ok: true } },
      {
        id: CODE_CALL,
        name: "ui_jsscript_set_code",
        args: { packages: ["@nodetool-ai/sandbox-csv"] },
        result: { issues: [] }
      },
      {
        id: TEST_CALL,
        name: "ui_jsscript_test",
        args: { cases: TESTS },
        result: { passed: 1, failed: 0 }
      }
    ]),

    ...assistantStream(ASSISTANT_ID, ANSWER, 14200, 3600),
    status(18000, "connected")
  ]
};
