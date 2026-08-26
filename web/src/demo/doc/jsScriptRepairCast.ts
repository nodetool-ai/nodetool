/**
 * "A test catches it, the assistant repairs it" tutorial cast.
 *
 * The script already works on clean input. The user names an edge case they
 * suspect — a non-numeric cell in a real export — and the assistant saves it
 * as a case (`ui_jsscript_set_tests`) and runs it (`ui_jsscript_test`). It
 * fails, in the open, with the reason. The repair is one call to
 * `ui_jsscript_set_code`, and the same cases run green after it.
 *
 * The point is the failing run: a green claim nobody watched fail is not a
 * check. Backend-free — no sandbox runs on replay, so both verdicts are part
 * of the cast the way a generated image is.
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

const FIND_TURN = "jsscript-repair-1";
const FIX_TURN = "jsscript-repair-2";
const TESTS_CALL = "jsscript-repair-set-tests";
const RUN_CALL = "jsscript-repair-run-red";
const CODE_CALL = "jsscript-repair-set-code";
const RERUN_CALL = "jsscript-repair-run-green";

const NAME = "Sum a CSV column";

/** `Number("n/a")` is NaN, and one NaN poisons the whole reduce. */
const BROKEN_CODE = `import { parse } from "@nodetool-ai/sandbox-csv";

const { data } = parse(inputs.csv, { header: true });
const total = data.reduce(
  (sum, row) => sum + Number(row[inputs.column] ?? 0),
  0
);
await output("total", total);
`;

const FIXED_CODE = `import { parse } from "@nodetool-ai/sandbox-csv";

const { data } = parse(inputs.csv, { header: true });
const total = data.reduce((sum, row) => {
  const n = Number(row[inputs.column]);
  return sum + (Number.isFinite(n) ? n : 0);
}, 0);
await output("total", total);
`;

const CLEAN_CASE = {
  name: "sums the amount column",
  inputs: { csv: "item,amount\\npens,3\\npaper,4.5\\n", column: "amount" },
  expect: { total: 7.5 }
};

const EDGE_CASE = {
  name: "skips a non-numeric cell",
  inputs: { csv: "item,amount\\npens,3\\npaper,n/a\\n", column: "amount" },
  expect: { total: 3 }
};

const PORTS = {
  inputs: [
    { name: "csv", type: "str" },
    { name: "column", type: "str" }
  ],
  outputs: [{ name: "total", type: "float" }]
};

const working: JsScriptCastDoc = {
  name: NAME,
  document: {
    schemaVersion: 1,
    description: "Sum one numeric column of a CSV.",
    code: BROKEN_CODE,
    inputs: PORTS.inputs,
    outputs: PORTS.outputs,
    secrets: [],
    timeoutSeconds: 30,
    tests: [CLEAN_CASE]
  }
};

const withEdgeCase: JsScriptCastDoc = {
  name: NAME,
  document: { ...working.document, tests: [CLEAN_CASE, EDGE_CASE] }
};

const repaired: JsScriptCastDoc = {
  name: NAME,
  document: { ...withEdgeCase.document, code: FIXED_CODE }
};

const DIAGNOSIS = [
  "It does break. ",
  'Number("n/a") is NaN, ',
  "and one NaN takes the whole sum ",
  "with it. Fixing the reducer."
];

const ANSWER = [
  "Both cases green: 7.5 on the clean ",
  "file, 3 with the bad cell skipped. ",
  "The case stays saved, so the next ",
  "edit that breaks this fails here first."
];

export const jsScriptRepairCast: JsScriptDocCast = {
  version: DOC_CAST_VERSION,
  kind: "doc",
  surface: "jsscript",
  id: "jsscript-repair",
  name: "A test catches it, the assistant repairs it",
  description:
    "Name the edge case you suspect: the assistant saves it, runs it red, fixes the body, and runs it green.",
  createdAt: new Date(0).toISOString(),
  durationMs: 22000,
  fps: 30,
  docId: "demo-jsscript-repair",
  assistantTitle: "JS Script Assistant",
  assistantModel: {
    type: "language_model",
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: PROVIDER_IDS.ANTHROPIC
  },

  doc: working,

  events: [
    patch(4200, withEdgeCase),
    patch(14000, repaired)
  ],

  assistant: [
    status(0, "connected"),
    userMessage(
      400,
      "Our exports sometimes carry n/a in the amount column. Add a case for that — I think it breaks."
    ),
    status(900, "streaming"),

    assistantStart(1600, FIND_TURN, [
      {
        id: TESTS_CALL,
        name: "ui_jsscript_set_tests",
        args: { add: EDGE_CASE.name }
      }
    ]),
    toolRunning(1900, TESTS_CALL, "Saving the case…"),
    toolRunning(4000, null),
    toolResult(4200, FIND_TURN, [
      {
        id: TESTS_CALL,
        name: "ui_jsscript_set_tests",
        args: { add: EDGE_CASE.name },
        result: { tests: 2 }
      },
      { id: RUN_CALL, name: "ui_jsscript_test", args: {} }
    ]),
    toolRunning(4600, RUN_CALL, "Running the cases…"),
    toolRunning(6800, null),
    // The red run, shown rather than summarized.
    toolResult(7000, FIND_TURN, [
      {
        id: TESTS_CALL,
        name: "ui_jsscript_set_tests",
        args: { add: EDGE_CASE.name },
        result: { tests: 2 }
      },
      {
        id: RUN_CALL,
        name: "ui_jsscript_test",
        args: {},
        result: {
          passed: 1,
          failed: 1,
          failures: [{ case: EDGE_CASE.name, expected: 3, got: "NaN" }]
        }
      }
    ]),
    ...assistantStream(FIND_TURN, DIAGNOSIS, 7400, 3200),

    assistantStart(11200, FIX_TURN, [
      {
        id: CODE_CALL,
        name: "ui_jsscript_set_code",
        args: { reason: "skip cells that are not finite numbers" }
      }
    ]),
    toolRunning(11500, CODE_CALL, "Rewriting the reducer…"),
    toolRunning(13800, null),
    toolResult(14000, FIX_TURN, [
      {
        id: CODE_CALL,
        name: "ui_jsscript_set_code",
        args: { reason: "skip cells that are not finite numbers" },
        result: { ok: true }
      },
      { id: RERUN_CALL, name: "ui_jsscript_test", args: {} }
    ]),
    toolRunning(14400, RERUN_CALL, "Running the cases…"),
    toolRunning(16600, null),
    toolResult(16800, FIX_TURN, [
      {
        id: CODE_CALL,
        name: "ui_jsscript_set_code",
        args: { reason: "skip cells that are not finite numbers" },
        result: { ok: true }
      },
      {
        id: RERUN_CALL,
        name: "ui_jsscript_test",
        args: {},
        result: { passed: 2, failed: 0 }
      }
    ]),
    ...assistantStream(FIX_TURN, ANSWER, 17200, 3800),
    status(21400, "connected")
  ]
};
