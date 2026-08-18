import { z } from "zod";
import { FrontendToolRegistry } from "../frontendTools";
import { getJsScriptAgentHandler } from "../../../components/jsScript/jsScriptAgentBridge";

/**
 * Frontend tools that let the agent author the open JS script document — its
 * body, declared ports, sandbox packages, metadata and saved test cases — and
 * execute it. Every tool takes an explicit `script_id` and delegates to the
 * handler that script's open JsScriptSurface registers on the
 * {@link jsScriptAgentBridge}; when that script is not open the handler getter
 * throws, naming the requested id and listing the open ones.
 *
 * Unlike the Code node assistant, these edits are the document: they autosave.
 * Run and test flush the live document first, then execute the saved row.
 */

const scriptIdParam = z
  .string()
  .describe(
    "Id of the JS script to act on. The open JS script ids are listed in the ui_context system prompt block."
  );

const portParam = z.object({
  name: z
    .string()
    .describe("Port name — a JavaScript identifier the body reads or emits."),
  type: z
    .string()
    .describe(
      "NodeTool type name, e.g. 'str', 'int', 'float', 'bool', 'list', 'dict', 'image', 'audio', 'video', 'any'."
    )
});

const packageParam = z.object({
  specifier: z
    .string()
    .describe("Sandbox module specifier, e.g. '@nodetool-ai/sandbox-yaml'."),
  resolvedPackVersion: z.string().optional(),
  contentDigest: z.string().optional()
});

const testCaseParam = z.object({
  name: z.string().describe("Case name, unique within the script."),
  inputs: z
    .record(z.string(), z.unknown())
    .describe("Input bag, keyed by declared input port name."),
  inputStreams: z
    .record(z.string(), z.array(z.unknown()))
    .optional()
    .describe(
      "Items staged per input handle for a body that reads `stream`, e.g. {\"numbers\": [1, 2, 3]}."
    ),
  expect: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Expected final value per declared output handle."),
  expectedStreamed: z
    .array(z.object({ name: z.string(), value: z.unknown() }))
    .optional()
    .describe("The emit calls the run must make, in order.")
});

FrontendToolRegistry.register({
  name: "ui_jsscript_get_state",
  description:
    "Read the specified JS script: its name and full document (description, code, declared inputs/outputs, secrets, timeout, saved test cases), the document-level validation issues, and the last run and test results from this editor. Call this first.",
  parameters: z.object({ script_id: scriptIdParam }),
  async execute({ script_id }) {
    const snapshot = getJsScriptAgentHandler(script_id).getSnapshot();
    return { ok: true, ...snapshot };
  }
});

FrontendToolRegistry.register({
  name: "ui_jsscript_set_code",
  description:
    "Replace the script's body; the editor updates live and autosaves. Write top-level statements only — the host wraps the body in an async function. Do not write `export` or `function run`. Declared inputs arrive on `inputs.<name>`; outputs leave through `await emit(name, value)` / `await output(name, value)`, never through `return`. Import any installed sandbox pack or `@nodetool-ai/sandbox-nodetool/<namespace>` directly — there is no packages setting.",
  parameters: z.object({
    script_id: scriptIdParam,
    code: z.string().describe("The full new JavaScript body.")
  }),
  async execute({ script_id, code }) {
    const snapshot = getJsScriptAgentHandler(script_id).setCode(code);
    return { ok: true, chars: code.length, issues: snapshot.issues };
  }
});

FrontendToolRegistry.register({
  name: "ui_jsscript_set_ports",
  description:
    "Replace the script's declared input and/or output ports wholesale. Pass `inputs` and/or `outputs` as arrays of {name, type}; an omitted array leaves that side unchanged. Names must match what the body reads from `inputs.<name>` and what it emits.",
  parameters: z.object({
    script_id: scriptIdParam,
    inputs: z
      .array(portParam)
      .optional()
      .describe("The complete new input port list, when changing inputs."),
    outputs: z
      .array(portParam)
      .optional()
      .describe("The complete new output port list, when changing outputs.")
  }),
  async execute({ script_id, inputs, outputs }) {
    const snapshot = getJsScriptAgentHandler(script_id).setPorts({
      inputs,
      outputs
    });
    return {
      ok: true,
      inputs: snapshot.document.inputs,
      outputs: snapshot.document.outputs,
      issues: snapshot.issues
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_jsscript_set_packages",
  description:
    "No-op leftover: a JS script does not declare packages. Every installed sandbox pack and every `@nodetool-ai/sandbox-nodetool/<namespace>` module resolves by import. The field is kept so old documents still parse.",
  parameters: z.object({
    script_id: scriptIdParam,
    packages: z
      .array(packageParam)
      .describe("The complete new package declaration list.")
  }),
  async execute({ script_id, packages }) {
    const snapshot = getJsScriptAgentHandler(script_id).setPackages(packages);
    return {
      ok: true,
      packages: snapshot.document.packages,
      issues: snapshot.issues
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_jsscript_set_meta",
  description:
    "Set the script's name, description, declared secret names, timeout in seconds, and/or its node-menu placement. Omitted fields are left alone. The description is how a later agent picks this script out of a list, so make it say what the script does. Secrets are the only ones the body may read; the timeout is capped at 120 seconds. Setting `palette` exposes the script in the node menu as one of the user's custom nodes, under the category it names; `null` takes it back out.",
  parameters: z.object({
    script_id: scriptIdParam,
    name: z.string().optional(),
    description: z.string().optional(),
    secrets: z
      .array(z.string())
      .optional()
      .describe("Secret names the body may read; [] for none."),
    timeoutSeconds: z.number().optional(),
    palette: z
      .object({
        category: z
          .string()
          .describe("Menu grouping, e.g. 'Text' or 'My API'. Free text.")
      })
      .nullable()
      .optional()
      .describe(
        "Show the script in the node menu under this category, or null to hide it."
      )
  }),
  async execute({
    script_id,
    name,
    description,
    secrets,
    timeoutSeconds,
    palette
  }) {
    const snapshot = getJsScriptAgentHandler(script_id).setMeta({
      name,
      description,
      secrets,
      timeoutSeconds,
      palette
    });
    return {
      ok: true,
      name: snapshot.name,
      description: snapshot.document.description,
      secrets: snapshot.document.secrets,
      timeoutSeconds: snapshot.document.timeoutSeconds,
      palette: snapshot.document.palette ?? null,
      issues: snapshot.issues
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_jsscript_set_tests",
  description:
    "Replace the script's saved test cases. Each case names its inputs and, optionally, the expected final outputs (`expect`, keyed by output handle) and the expected emit sequence (`expectedStreamed`). These are the cases ui_jsscript_test runs.",
  parameters: z.object({
    script_id: scriptIdParam,
    tests: z.array(testCaseParam).describe("The complete new case list.")
  }),
  async execute({ script_id, tests }) {
    const snapshot = getJsScriptAgentHandler(script_id).setTests(tests);
    return {
      ok: true,
      tests: snapshot.document.tests,
      issues: snapshot.issues
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_jsscript_run",
  description:
    "Flush the live document, then run the saved script server-side in the QuickJS sandbox with the given inputs — or, for a body that reads `stream`, with items staged per handle in `input_streams` — and return its outputs, emitted stream, logs, error and duration. The run executes the saved document after the flush. The run fails when declared outputs are all empty.",
  parameters: z.object({
    script_id: scriptIdParam,
    inputs: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Input bag keyed by declared input port name."),
    input_streams: z
      .record(z.string(), z.array(z.unknown()))
      .optional()
      .describe(
        "Items staged per input handle for a body that reads `stream`. The body runs once and pulls them; a buffered body uses `inputs` instead."
      )
  }),
  async execute({ script_id, inputs, input_streams }) {
    const outcome = await getJsScriptAgentHandler(script_id).run(
      inputs ?? {},
      input_streams
    );
    // The nested `run.ok` is what the body did. Mirror it on the tool
    // result so a failed run is not a successful tool call.
    return { ok: outcome.ok, run: outcome };
  }
});

FrontendToolRegistry.register({
  name: "ui_jsscript_test",
  description:
    "Flush the live document, then run every saved test case and return the grade report: how many passed and failed, and for each case its outputs, emitted stream, logs, error, and the mismatches. Fails when there are no saved cases. Add cases first with ui_jsscript_set_tests.",
  parameters: z.object({ script_id: scriptIdParam }),
  async execute({ script_id }) {
    const report = await getJsScriptAgentHandler(script_id).test();
    return { ok: true, ...report };
  }
});
