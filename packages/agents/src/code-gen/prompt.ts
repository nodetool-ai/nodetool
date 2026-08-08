/**
 * Prompt construction for Code node authoring.
 *
 * The API section is rendered from the sandbox manifest rather than written by
 * hand, so a bridge that is added or removed cannot leave the prompt promising
 * something the guest does not have. Pure functions, no I/O — the planner, the
 * evals, and the drift test all build the same text.
 */
import type {
  CodeGenExpectedOutput,
  CodeGenInputPort,
  CodeGenOutputPort,
  CodeGenSampleValues
} from "@nodetool-ai/protocol/api-schemas/code-gen.js";
import { renderSandboxApiReference } from "./sandbox-prompt.js";
import { CORE_PORT_TYPES } from "./port-types.js";
import type { SandboxManifest } from "./sandbox-manifest.js";

/** Cap on one rendered sample value so a big payload can't crowd out the task. */
const MAX_SAMPLE_PREVIEW_CHARS = 800;

export interface CodeGenPromptInput {
  instruction: string;
  inputs: readonly CodeGenInputPort[];
  expectedOutput?: CodeGenExpectedOutput;
  /** Edit path: the code and slots already on the node. */
  currentCode?: string;
  currentInputs?: readonly CodeGenInputPort[];
  currentOutputs?: readonly CodeGenOutputPort[];
  /** Only present when the user ticked "include sample values". */
  sampleValues?: CodeGenSampleValues;
}

const AUTHORING_RULES = `# Your job

Write the body of one JavaScript function for a NodeTool Code node, then submit
it with the submit_code tool. The submitted arguments are the only thing that
counts: text you write outside the tool call, including fenced code blocks, is
discarded.

Each declared input arrives as a global variable of that name. The function ends
by returning an object whose keys are exactly the declared outputs.

# Rules

- Return an object with every declared output on every return path, including
  early returns and both arms of a conditional. A branch that leaves an output
  out is workflow branching, not code — keep the code total and branch with the
  If or Switch control nodes downstream instead.
- Prefer pure data reshaping. Reach for fetch, workspace, or getSecret only when
  the instruction asks for outside data.
- When the node fetches or reads for each item of a list, fan the calls out with
  \`parallelMap\` (or \`Promise.all\` for a short fixed set) instead of awaiting
  one per loop iteration — they run concurrently, and a sequential loop over a
  20-row list is 20 round trips where one would do.
- Do not use \`state\` or \`yield\` unless the instruction asks for streaming or
  for values that persist across runs. A one-shot transformation needs neither.
- Pass media and asset reference objects through unchanged. They are handles the
  rest of the workflow resolves; never re-encode one as base64 or a data URL.
- Declare a type per port, using NodeTool's own names: \`${CORE_PORT_TYPES.join(
  "`, `"
)}\`, or an asset/node type. They are not JSON Schema names — an integer is
  \`int\`, a string is \`str\`, a boolean is \`bool\`, an object is \`dict\`, an
  array is \`list\`. A port typed with the wrong name will not connect. Use
  \`any\` only when the value really is unknown.
- Keep the code readable: no defensive wrappers around values the node is
  already typed for, no comments restating the line below them.`;

/**
 * The system prompt: the job, the rules, and the sandbox surface.
 */
export function buildCodeGenSystemPrompt(manifest?: SandboxManifest): string {
  return `${AUTHORING_RULES}\n\n${renderSandboxApiReference(manifest)}`;
}

function renderType(type: { type: string; optional?: boolean }): string {
  return type.optional ? `${type.type} (optional)` : type.type;
}

function renderPort(
  port: CodeGenInputPort | CodeGenOutputPort,
  extra = ""
): string {
  const description = port.description ? ` — ${port.description}` : "";
  return `- ${port.name}: ${renderType(port.type)}${extra}${description}`;
}

function renderInputs(inputs: readonly CodeGenInputPort[]): string {
  if (inputs.length === 0) {
    return "None. Declare whatever inputs the task needs.";
  }
  return inputs
    .map((input) =>
      renderPort(input, input.required === false ? " [optional]" : "")
    )
    .join("\n");
}

function renderSamples(samples: CodeGenSampleValues): string {
  const lines: string[] = [];
  for (const [name, value] of Object.entries(samples)) {
    let rendered: string;
    try {
      rendered = JSON.stringify(value) ?? "undefined";
    } catch {
      rendered = String(value);
    }
    if (rendered.length > MAX_SAMPLE_PREVIEW_CHARS) {
      rendered = `${rendered.slice(0, MAX_SAMPLE_PREVIEW_CHARS)}…`;
    }
    lines.push(`- ${name} = ${rendered}`);
  }
  return lines.join("\n");
}

/**
 * The user prompt: the task, the slots to write against, and — only when the
 * user opted in — the sample values.
 */
export function buildCodeGenUserPrompt(input: CodeGenPromptInput): string {
  const sections: string[] = [
    `Task:\n${input.instruction.trim()}`,
    `Available inputs:\n${renderInputs(input.inputs)}${
      input.inputs.length > 0
        ? "\nDeclare every one of these inputs with this exact name and type — " +
          "each is already connected to another node. Add others only if the " +
          "task needs them."
        : ""
    }`
  ];

  if (input.expectedOutput) {
    sections.push(
      `Required output (a downstream connection expects it):\n- ${input.expectedOutput.name}: ${renderType(input.expectedOutput.type)}\nDeclare this output with this exact name and type. Add others only if the task needs them.`
    );
  }

  if (input.currentCode) {
    const slots: string[] = [];
    if (input.currentInputs && input.currentInputs.length > 0) {
      slots.push(
        `Current inputs:\n${input.currentInputs.map((port) => renderPort(port)).join("\n")}`
      );
    }
    if (input.currentOutputs && input.currentOutputs.length > 0) {
      slots.push(
        `Current outputs:\n${input.currentOutputs.map((port) => renderPort(port)).join("\n")}`
      );
    }
    sections.push(
      [
        `Revise this existing node. Submit the full replacement, not a patch:`,
        "```javascript",
        input.currentCode,
        "```",
        ...slots
      ].join("\n")
    );
  }

  if (input.sampleValues && Object.keys(input.sampleValues).length > 0) {
    sections.push(
      `Sample values the user shared (representative, not exhaustive):\n${renderSamples(input.sampleValues)}`
    );
  }

  sections.push("Call submit_code with the finished node.");
  return sections.join("\n\n");
}

/**
 * Feedback for a rejected submission. Carries the rejected code back because the
 * provider loop replays a copied message list, so "fix it" is only actionable
 * with the attempt attached.
 */
export function buildCodeGenRetryPrompt(
  errors: readonly string[],
  lastCode?: string
): string {
  const parts = [
    `The submission was rejected:\n${errors.map((error) => `- ${error}`).join("\n")}`
  ];
  if (lastCode) {
    parts.push(`Your last submission:\n\`\`\`javascript\n${lastCode}\n\`\`\``);
  }
  parts.push("Fix the issues and call submit_code with the full corrected node.");
  return parts.join("\n\n");
}
