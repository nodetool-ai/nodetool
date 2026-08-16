/**
 * `ui_jsscript_*` — the tools that let the agent author an open JS script.
 *
 * A port of web's `builtin/jsscript.ts` with zod swapped for plain JSON Schema
 * and the package-declaration tool dropped: a script imports whatever the host
 * installs, and a phone cannot install a pack. Every tool takes an explicit
 * `script_id` and delegates to the handler the mounted JsScriptEditorScreen
 * registered; when that script is not open the getter throws naming the open
 * ids, and the tool layer hands that message to the agent verbatim.
 *
 * The one behavioral difference from web: edits here mark the document dirty
 * rather than autosaving, so `run` and `test` save first — the endpoint
 * executes the saved row, not the screen's buffer.
 */

import { getDocumentHandler } from '../agentBridge';
import { MobileToolRegistry } from './registry';
import type {
  JsScriptAgentHandler,
  JsScriptPort,
  JsScriptTestCase,
} from '../jsScriptTypes';

const handlerFor = (scriptId: string): JsScriptAgentHandler =>
  getDocumentHandler<JsScriptAgentHandler>('jsscript', scriptId);

const scriptIdProperty = {
  type: 'string',
  description:
    'Id of the JS script to act on. Valid ids are listed in the ui_context block of the system prompt; there is no "current script" fallback.',
} as const;

const portSchema = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      description: 'Port name — a JavaScript identifier the body reads or emits.',
    },
    type: {
      type: 'string',
      description:
        "NodeTool type name, e.g. 'str', 'int', 'float', 'bool', 'list', 'dict', 'image', 'audio', 'video', 'any'.",
    },
  },
  required: ['name', 'type'],
} as const;

const testCaseSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Case name, unique within the script.' },
    inputs: {
      type: 'object',
      description: 'Input bag, keyed by declared input port name.',
    },
    inputStreams: {
      type: 'object',
      description:
        'Items staged per input handle for a body that reads `stream`, e.g. {"numbers": [1, 2, 3]}.',
    },
    expect: {
      type: 'object',
      description: 'Expected final value per declared output handle.',
    },
    expectedStreamed: {
      type: 'array',
      description: 'The emit calls the run must make, in order.',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, value: {} },
        required: ['name', 'value'],
      },
    },
  },
  required: ['name', 'inputs'],
} as const;

interface ScriptIdArgs {
  script_id: string;
}

MobileToolRegistry.register<ScriptIdArgs>({
  name: 'ui_jsscript_get_state',
  description:
    'Read a JS script: its name and full document (description, code, declared inputs and outputs, secrets, timeout, saved test cases), the document-level validation issues, and the last run and test results from this editor. Call this first — every other tool writes into what it returns.',
  parameters: {
    type: 'object',
    properties: { script_id: scriptIdProperty },
    required: ['script_id'],
  },
  async execute({ script_id }) {
    return { ok: true, ...handlerFor(script_id).getSnapshot() };
  },
});

interface SetCodeArgs extends ScriptIdArgs {
  code: string;
}

MobileToolRegistry.register<SetCodeArgs>({
  name: 'ui_jsscript_set_code',
  description:
    'Replace the script body; the editor repaints immediately. Write top-level statements only — the host wraps the body in an async function. Do not write `export` or `function run`. Declared inputs arrive on `inputs.<name>`; outputs leave through `await emit(name, value)` / `await output(name, value)`, never through `return`. Import any installed sandbox pack or `@nodetool-ai/sandbox-nodetool/<namespace>` directly — there is no packages setting.',
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      code: { type: 'string', description: 'The full new JavaScript body.' },
    },
    required: ['script_id', 'code'],
  },
  async execute({ script_id, code }) {
    const snapshot = handlerFor(script_id).setCode(code);
    return { ok: true, chars: code.length, issues: snapshot.issues };
  },
});

interface SetPortsArgs extends ScriptIdArgs {
  inputs?: JsScriptPort[];
  outputs?: JsScriptPort[];
}

MobileToolRegistry.register<SetPortsArgs>({
  name: 'ui_jsscript_set_ports',
  description:
    'Replace the declared input and/or output ports wholesale. Pass `inputs` and/or `outputs` as arrays of {name, type}; an omitted array leaves that side unchanged. Names must match what the body reads from `inputs.<name>` and what it emits.',
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      inputs: {
        type: 'array',
        description: 'The complete new input port list, when changing inputs.',
        items: portSchema,
      },
      outputs: {
        type: 'array',
        description: 'The complete new output port list, when changing outputs.',
        items: portSchema,
      },
    },
    required: ['script_id'],
  },
  async execute({ script_id, inputs, outputs }) {
    const snapshot = handlerFor(script_id).setPorts({ inputs, outputs });
    return {
      ok: true,
      inputs: snapshot.document.inputs,
      outputs: snapshot.document.outputs,
      issues: snapshot.issues,
    };
  },
});

interface SetMetaArgs extends ScriptIdArgs {
  name?: string;
  description?: string;
  secrets?: string[];
  timeoutSeconds?: number;
}

MobileToolRegistry.register<SetMetaArgs>({
  name: 'ui_jsscript_set_meta',
  description:
    "Set the script's name, description, declared secret names, and/or timeout in seconds. Omitted fields are left alone. The description is how a later agent picks this script out of a list, so make it say what the script does. Secrets are the only ones the body may read; the timeout is capped at 120 seconds.",
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      name: { type: 'string', description: 'The script name.' },
      description: {
        type: 'string',
        description: 'What the script does, in one or two sentences.',
      },
      secrets: {
        type: 'array',
        description: 'Secret names the body may read; [] for none.',
        items: { type: 'string' },
      },
      timeoutSeconds: {
        type: 'number',
        description: 'Run timeout in seconds, 1 to 120.',
      },
    },
    required: ['script_id'],
  },
  async execute({ script_id, name, description, secrets, timeoutSeconds }) {
    const snapshot = handlerFor(script_id).setMeta({
      name,
      description,
      secrets,
      timeoutSeconds,
    });
    return {
      ok: true,
      name: snapshot.name,
      description: snapshot.document.description,
      secrets: snapshot.document.secrets,
      timeoutSeconds: snapshot.document.timeoutSeconds,
      issues: snapshot.issues,
    };
  },
});

interface SetTestsArgs extends ScriptIdArgs {
  tests: JsScriptTestCase[];
}

MobileToolRegistry.register<SetTestsArgs>({
  name: 'ui_jsscript_set_tests',
  description:
    'Replace the saved test cases. Each case names its inputs and, optionally, the expected final outputs (`expect`, keyed by output handle) and the expected emit sequence (`expectedStreamed`). These are the cases ui_jsscript_test runs.',
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      tests: {
        type: 'array',
        description: 'The complete new case list.',
        items: testCaseSchema,
      },
    },
    required: ['script_id', 'tests'],
  },
  async execute({ script_id, tests }) {
    const snapshot = handlerFor(script_id).setTests(tests);
    return { ok: true, tests: snapshot.document.tests, issues: snapshot.issues };
  },
});

MobileToolRegistry.register<ScriptIdArgs>({
  name: 'ui_jsscript_save',
  description:
    'Persist the script. Edits made through these tools are local until saved, exactly like the user\'s own edits — but ui_jsscript_run and ui_jsscript_test save on their own, so this is for finishing an editing pass without running anything.',
  parameters: {
    type: 'object',
    properties: { script_id: scriptIdProperty },
    required: ['script_id'],
  },
  async execute({ script_id }) {
    return handlerFor(script_id).save();
  },
});

interface RunArgs extends ScriptIdArgs {
  inputs?: Record<string, unknown>;
  input_streams?: Record<string, unknown[]>;
}

MobileToolRegistry.register<RunArgs>({
  name: 'ui_jsscript_run',
  description:
    'Save the script, then run it server-side in the QuickJS sandbox with the given inputs — or, for a body that reads `stream`, with items staged per handle in `input_streams` — and return its outputs, emitted stream, logs, error and duration. Nothing runs on the phone. The run fails when the declared outputs all come back empty.',
  parameters: {
    type: 'object',
    properties: {
      script_id: scriptIdProperty,
      inputs: {
        type: 'object',
        description: 'Input bag keyed by declared input port name.',
      },
      input_streams: {
        type: 'object',
        description:
          'Items staged per input handle for a body that reads `stream`. The body runs once and pulls them; a buffered body uses `inputs` instead.',
      },
    },
    required: ['script_id'],
  },
  async execute({ script_id, inputs, input_streams }) {
    const outcome = await handlerFor(script_id).run(inputs ?? {}, input_streams);
    // The nested `run.ok` is what the body did. Mirror it on the tool result so
    // a failed run is not a successful tool call.
    return { ok: outcome.ok, run: outcome };
  },
});

MobileToolRegistry.register<ScriptIdArgs>({
  name: 'ui_jsscript_test',
  description:
    'Save the script, then run every saved test case and return the grade report: how many passed and failed, and for each case its outputs, emitted stream, logs, error, and the mismatches. Fails when there are no saved cases — add them first with ui_jsscript_set_tests.',
  parameters: {
    type: 'object',
    properties: { script_id: scriptIdProperty },
    required: ['script_id'],
  },
  async execute({ script_id }) {
    const report = await handlerFor(script_id).test();
    return { ok: true, ...report };
  },
});
