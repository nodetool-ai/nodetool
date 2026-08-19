/**
 * The `code` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `code.ts`, so nothing the
 * implementations pull in reaches the entry graph. `code.ts` imports these
 * back and attaches each to its implementation, so there is one spec object
 * behind both halves.
 */

import type { CapabilitySpec } from "./types.js";
import type { JsonSchema } from "@nodetool-ai/runtime";

export const MAX_TIMEOUT_SECONDS = 120;

export const DEFAULT_TIMEOUT_SECONDS = 30;

export const MAX_TEST_CASES = 20;

export const CODE_FIELD: JsonSchema = {
  type: "string",
  description:
    "The Code-node body: plain JavaScript. Declared inputs arrive on the " +
    "`inputs` object. Outputs leave through two calls: " +
    "`await emit(name, value)` streams one value from an output handle, and " +
    "`await output(name, value)` sets a handle's final value. `return` is " +
    "control flow only — its value is ignored. A body calling neither runs " +
    "the deprecated return/yield contract for one more release."
};

export const INPUT_STREAMS_FIELD: JsonSchema = {
  type: "object",
  description:
    "Items to feed a body that reads its inputs with `stream`, as " +
    '{handle: [item, …]}, e.g. {"numbers": [1, 2, 3]}. The body runs once ' +
    "and pulls them: `stream(name)` yields one handle's items in order, " +
    "`stream.any()` yields [handle, value] round-robin by index across the " +
    "handles in declaration order, `stream.first(name)` takes one, and " +
    "`stream.open(name)` reports whether items remain. Omit it for a " +
    "buffered body, whose values go in `inputs` instead.",
  additionalProperties: { type: "array" }
};

export const validateCodeSpec: CapabilitySpec = {
  name: "validate_code",
  description:
    "Statically check a Code-node body without running it: syntax, imports " +
    "against the installed sandbox packs, undefined names, undeclared " +
    "`inputs.*` reads, unused inputs, and whether every declared output is " +
    "reached by an `emit` or `output` call. Same check the workflow " +
    "validator runs. Call it after every edit — it is far cheaper than " +
    "run_code.",
  inputSchema: {
    type: "object",
    properties: {
      code: CODE_FIELD,
      inputs: {
        type: "array",
        items: { type: "string" },
        description: "Input names the node declares (keys on `inputs`)."
      },
      outputs: {
        type: "array",
        items: { type: "string" },
        description: "Output handle names the node declares."
      },
    },
    required: ["code"]
  },
  category: "read",
  userMessage: () => "Validating code"
};

export const runCodeSpec: CapabilitySpec = {
  name: "run_code",
  description:
    "Run a Code-node body in the QuickJS sandbox with the given `inputs` " +
    "and report its outputs, console logs, and error. Values passed to " +
    "`output(name, value)` come back as `outputs`; values passed to " +
    "`emit(name, value)` come back as `streamed`, an ordered list of " +
    "`{name, value}`. A legacy return/yield body reports its return bag as " +
    "`outputs` and its yielded items as `streamed`. A body that reads its " +
    "inputs with `stream` runs once over the items staged in " +
    "`input_streams`. The run is hermetic: no " +
    "node toolbelt, and only the secrets named in `secrets` are readable. " +
    "Use it to debug a body before saving it onto a node.",
  inputSchema: {
    type: "object",
    properties: {
      code: CODE_FIELD,
      inputs: {
        type: "object",
        description: "Input values the body reads from the `inputs` object.",
        additionalProperties: true
      },
      input_streams: INPUT_STREAMS_FIELD,
      secrets: {
        type: "array",
        items: { type: "string" },
        description:
          "Secret names the body may read via getSecret(). Default: none."
      },
      timeout_seconds: {
        type: "number",
        description: `Execution timeout (default ${DEFAULT_TIMEOUT_SECONDS}, max ${MAX_TIMEOUT_SECONDS}).`
      }
    },
    required: ["code"]
  },
  category: "execute",
  userMessage: () => "Running code in the sandbox"
};

export const testCodeSpec: CapabilitySpec = {
  name: "test_code",
  description:
    "Run a Code-node body against a list of test cases and grade each one. " +
    "A case supplies `inputs` (or `input_streams`, for a body that reads " +
    "`stream`) and optionally `expect` — expected final " +
    "values per output handle, compared structurally; outputs not named in " +
    "`expect` are ignored — and `expected_streamed`, the full ordered list " +
    "of `{name, value}` the body must emit. A case with neither passes when " +
    "the body runs without error. Use it as the regression check after " +
    "editing code.",
  inputSchema: {
    type: "object",
    properties: {
      code: CODE_FIELD,
      cases: {
        type: "array",
        description: `Test cases (max ${MAX_TEST_CASES}).`,
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Case label." },
            inputs: {
              type: "object",
              description: "Input values for this case.",
              additionalProperties: true
            },
            input_streams: INPUT_STREAMS_FIELD,
            expect: {
              type: "object",
              description:
                "Expected final value per output handle, compared " +
                "structurally.",
              additionalProperties: true
            },
            expected_streamed: {
              type: "array",
              description:
                "Every value the body must emit, in call order. The list is " +
                "compared whole: a differing length or entry fails the case.",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Output handle the value was emitted from."
                  },
                  value: { description: "The emitted value." }
                },
                required: ["name", "value"]
              }
            }
          },
          required: []
        }
      },
      secrets: {
        type: "array",
        items: { type: "string" },
        description:
          "Secret names the body may read via getSecret(). Default: none."
      },
      timeout_seconds: {
        type: "number",
        description: `Per-case timeout (default ${DEFAULT_TIMEOUT_SECONDS}, max ${MAX_TIMEOUT_SECONDS}).`
      }
    },
    required: ["code", "cases"]
  },
  category: "execute",
  userMessage: (params) => {
    const count = Array.isArray(params["cases"]) ? params["cases"].length : 0;
    return `Testing code against ${count} case${count === 1 ? "" : "s"}`;
  }
};

/** Every spec this module declares, in declaration order. */
export const codeSpecs: readonly CapabilitySpec[] = [
  validateCodeSpec,
  runCodeSpec,
  testCodeSpec
];
