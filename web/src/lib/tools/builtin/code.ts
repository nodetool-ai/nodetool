import { z } from "zod";
import { FrontendToolRegistry } from "../frontendTools";
import { getCodeAssistantHandler } from "../../../components/node_types/code_assistant/codeAssistantBridge";

/**
 * Frontend tools that let the agent read and edit the draft of an open Code
 * assistant dialog — the code body, the declared input/output ports, and the
 * sandbox package declarations. Every tool takes an explicit `node_id` and
 * delegates to the handler the dialog registers on the
 * {@link codeAssistantBridge}; when no assistant is open for that node the
 * handler getter throws, naming the requested id and listing the open ones.
 *
 * The draft is applied to the node only when the user clicks Apply; check
 * edits with the server tools `validate_code`, `run_code`, and `test_code`.
 */

const nodeIdParam = z
  .string()
  .describe("Id of the Code node whose assistant dialog is open.");

const portParam = z.object({
  name: z
    .string()
    .describe("Port name — a JavaScript identifier the code reads or returns."),
  type: z
    .string()
    .describe(
      "NodeTool type name, e.g. 'str', 'int', 'float', 'bool', 'list', 'dict', 'image', 'audio', 'video', 'any'."
    )
});

FrontendToolRegistry.register({
  name: "ui_code_get_state",
  description:
    "Read the open Code assistant's draft: the node id, the current code body, the declared input and output ports (name and type). Call this first to see what you are editing.",
  parameters: z.object({ node_id: nodeIdParam }),
  async execute({ node_id }) {
    const state = getCodeAssistantHandler(node_id).getState();
    return { ok: true, ...state };
  }
});

FrontendToolRegistry.register({
  name: "ui_code_set_code",
  description:
    "Replace the Code assistant's draft code body; the editor updates live. Declared inputs arrive on the `inputs` object, the returned object's keys become output handles, and `yield` streams items. Validate with `validate_code` after every edit.",
  parameters: z.object({
    node_id: nodeIdParam,
    code: z.string().describe("The full new JavaScript code body.")
  }),
  async execute({ node_id, code }) {
    getCodeAssistantHandler(node_id).setCode(code);
    return { ok: true, chars: code.length };
  }
});

FrontendToolRegistry.register({
  name: "ui_code_set_ports",
  description:
    "Replace the draft's declared input and/or output ports wholesale. Pass `inputs` and/or `outputs` as arrays of {name, type}; an omitted array leaves that side unchanged. Port names must match what the code reads from `inputs.<name>` and the keys it returns.",
  parameters: z.object({
    node_id: nodeIdParam,
    inputs: z
      .array(portParam)
      .optional()
      .describe("The complete new input port list, when changing inputs."),
    outputs: z
      .array(portParam)
      .optional()
      .describe("The complete new output port list, when changing outputs.")
  }),
  async execute({ node_id, inputs, outputs }) {
    const handler = getCodeAssistantHandler(node_id);
    handler.setPorts({ inputs, outputs });
    const state = handler.getState();
    return { ok: true, inputs: state.inputs, outputs: state.outputs };
  }
});

