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
 * Run and test execute server-side in the QuickJS sandbox against the *saved*
 * document, so an edit needs a moment to land before a run reflects it.
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
    "Read the specified JS script: its name and full document (description, code, declared inputs/outputs, sandbox packages, secrets, timeout, saved test cases), the document-level validation issues, and the last run and test results from this editor. Call this first.",
  parameters: z.object({ script_id: scriptIdParam }),
  async execute({ script_id }) {
    const snapshot = getJsScriptAgentHandler(script_id).getSnapshot();
    return { ok: true, ...snapshot };
  }
});

FrontendToolRegistry.register({
  name: "ui_jsscript_set_code",
  description:
    "Replace the script's body; the editor updates live and autosaves. Declared inputs arrive on the `inputs` object (`inputs.<name>`); outputs leave through `emit(name, value)` / `output(name, value)`, never through `return`. A sandbox package must be declared with ui_jsscript_set_packages before its import resolves.",
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
    "Replace the sandbox packages the body may import. Pass the complete list; an undeclared import fails validation before it fails at run time.",
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
    "Set the script's name, description, declared secret names, and/or timeout in seconds. Omitted fields are left alone. The description is how a later agent picks this script out of a list, so make it say what the script does. Secrets are the only ones the body may read; the timeout is capped at 120 seconds.",
  parameters: z.object({
    script_id: scriptIdParam,
    name: z.string().optional(),
    description: z.string().optional(),
    secrets: z
      .array(z.string())
      .optional()
      .describe("Secret names the body may read; [] for none."),
    timeoutSeconds: z.number().optional()
  }),
  async execute({ script_id, name, description, secrets, timeoutSeconds }) {
    const snapshot = getJsScriptAgentHandler(script_id).setMeta({
      name,
      description,
      secrets,
      timeoutSeconds
    });
    return {
      ok: true,
      name: snapshot.name,
      description: snapshot.document.description,
      secrets: snapshot.document.secrets,
      timeoutSeconds: snapshot.document.timeoutSeconds,
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
    "Run the script server-side in the QuickJS sandbox with the given inputs and return its outputs, emitted stream, logs, error and duration. The run executes the SAVED document, so make edits and then run — an edit still riding the autosave debounce will not be reflected.",
  parameters: z.object({
    script_id: scriptIdParam,
    inputs: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Input bag keyed by declared input port name.")
  }),
  async execute({ script_id, inputs }) {
    const outcome = await getJsScriptAgentHandler(script_id).run(inputs ?? {});
    return { ok: true, run: outcome };
  }
});

FrontendToolRegistry.register({
  name: "ui_jsscript_test",
  description:
    "Run every saved test case against the script and return the grade report: how many passed and failed, and for each case its outputs, emitted stream, logs, error, and the mismatches between what it expected and what it got. Save cases first with ui_jsscript_set_tests.",
  parameters: z.object({ script_id: scriptIdParam }),
  async execute({ script_id }) {
    const report = await getJsScriptAgentHandler(script_id).test();
    return { ok: true, ...report };
  }
});
