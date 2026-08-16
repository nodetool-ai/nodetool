/**
 * SubmitCodeTool -- the one tool `CodePlanner` forces.
 *
 * The model submits the whole Code node — title, summary, code, typed input and
 * output slots — as one tool call. Transport shape is checked with the protocol
 * schema, then the code is parsed and every declared output is verified on every
 * visible return path. Failures come back as the tool result, so the model fixes
 * the submission over feedback rounds instead of the planner re-prompting
 * from scratch.
 *
 * Only the arguments of an accepted call become the result. Free text and code
 * fences in the assistant message are never read.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  codeGenSubmission,
  MAX_CODE_LENGTH,
  MAX_PORTS,
  MAX_SUMMARY_LENGTH,
  MAX_TITLE_LENGTH,
  type CodeGenExpectedOutput,
  type CodeGenInputPort,
  type CodeGenSubmission
} from "@nodetool-ai/protocol/api-schemas/code-gen.js";
import { z } from "zod";
import { Tool } from "./base-tool.js";
import { analyzeGeneratedCode } from "../code-gen/analyze.js";
import {
  checkPortTypes,
  formatPortType,
  portTypesCompatible
} from "../code-gen/port-types.js";
import { isString } from "../utils/type-guards.js";

const PORT_TYPE_SCHEMA = {
  type: "object" as const,
  description:
    "NodeTool type metadata, e.g. {\"type\": \"str\"} or " +
    "{\"type\": \"list\", \"type_args\": [{\"type\": \"str\"}]}.",
  properties: {
    type: {
      type: "string" as const,
      description:
        "Type name: str, int, float, bool, list, dict, any, image, audio, video, document."
    },
    optional: { type: "boolean" as const },
    type_args: {
      type: "array" as const,
      description: "Element types for list and dict.",
      items: { type: "object" as const }
    }
  },
  required: ["type"]
};

const SUBMIT_CODE_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    title: {
      type: "string" as const,
      maxLength: MAX_TITLE_LENGTH,
      description: "Imperative node title, e.g. \"Merge orders by customer\"."
    },
    summary: {
      type: "string" as const,
      maxLength: MAX_SUMMARY_LENGTH,
      description: "One sentence describing what the node does."
    },
    code: {
      type: "string" as const,
      maxLength: MAX_CODE_LENGTH,
      description:
        "The function body. Declared inputs are globals; end by returning an " +
        "object whose keys are exactly the declared outputs."
    },
    inputs: {
      type: "array" as const,
      maxItems: MAX_PORTS,
      description: "Input slots the code reads as global variables.",
      items: {
        type: "object" as const,
        properties: {
          name: {
            type: "string" as const,
            description: "Valid JavaScript identifier, unique among inputs."
          },
          type: PORT_TYPE_SCHEMA,
          description: { type: "string" as const },
          required: { type: "boolean" as const }
        },
        required: ["name", "type"]
      }
    },
    outputs: {
      type: "array" as const,
      minItems: 1,
      maxItems: MAX_PORTS,
      description: "Output slots. Must match the keys of the returned object.",
      items: {
        type: "object" as const,
        properties: {
          name: {
            type: "string" as const,
            description: "Valid JavaScript identifier, unique among outputs."
          },
          type: PORT_TYPE_SCHEMA,
          description: { type: "string" as const }
        },
        required: ["name", "type"]
      }
    }
  },
  required: ["title", "summary", "code", "inputs", "outputs"]
};

export interface SubmitCodeToolOptions {
  /** Fired once a submission is accepted, so the planner can end its loop. */
  onAccepted?: () => void;
  /**
   * Inputs seeded from handles that are already wired. The edge referencing
   * each one was created before generation ran, so a submission that renames,
   * drops, or incompatibly retypes one leaves the edge pointing at a handle the
   * node no longer has.
   */
  requiredInputs?: readonly CodeGenInputPort[];
  /** The output an existing edge already consumes, under the same contract. */
  expectedOutput?: CodeGenExpectedOutput;
}

/**
 * Errors for seeded ports the submission failed to honour.
 *
 * The transport schema checks the submission against itself; nothing there
 * knows which handles the graph has already wired. That contract is what makes
 * the pre-created edge valid, so it is enforced here, where a violation can
 * still be handed back to the model as a feedback round.
 */
function checkSeededPorts(
  submission: CodeGenSubmission,
  requiredInputs: readonly CodeGenInputPort[],
  expectedOutput: CodeGenExpectedOutput | undefined
): string[] {
  const errors: string[] = [];

  for (const required of requiredInputs) {
    const match = submission.inputs.find((port) => port.name === required.name);
    if (!match) {
      errors.push(
        `Input "${required.name}" is already connected to another node and must ` +
          `stay in the submission under that exact name. Declare it as ` +
          `"${required.name}": ${formatPortType(required.type)}.`
      );
      continue;
    }
    if (!portTypesCompatible(required.type, match.type)) {
      errors.push(
        `Input "${required.name}" is connected as ${formatPortType(required.type)}, ` +
          `but the submission types it ${formatPortType(match.type)}. Keep the ` +
          `connected type, and convert inside the code if you need another shape.`
      );
    }
  }

  if (expectedOutput) {
    const match = submission.outputs.find(
      (port) => port.name === expectedOutput.name
    );
    if (!match) {
      errors.push(
        `Output "${expectedOutput.name}" is already connected to another node ` +
          `and must stay in the submission under that exact name. Declare it as ` +
          `"${expectedOutput.name}": ${formatPortType(expectedOutput.type)}.`
      );
      // Wire order: the submission's output feeds the handle that expects it.
      // The check is symmetric, so this reads as the graph does.
    } else if (!portTypesCompatible(match.type, expectedOutput.type)) {
      errors.push(
        `Output "${expectedOutput.name}" is consumed as ` +
          `${formatPortType(expectedOutput.type)}, but the submission types it ` +
          `${formatPortType(match.type)}. Return the connected type.`
      );
    }
  }

  return errors;
}

/** What {@link SubmitCodeTool} answers: the accepted submission, or why not. */
export type SubmitCodeResult =
  | { status: "code_rejected"; errors: string[] }
  | {
      status: "code_accepted";
      title: string;
      inputs: string[];
      outputs: string[];
    };

export class SubmitCodeTool extends Tool {
  readonly name = "submit_code";
  readonly description =
    "Submit the finished Code node: title, summary, code, and typed input and " +
    "output slots. Returns the validation errors to fix (resubmit the full " +
    "corrected node), or accepts the submission.";
  readonly jsonSchema = SUBMIT_CODE_INPUT_SCHEMA satisfies Record<string, unknown>;

  private _submission: CodeGenSubmission | null = null;
  /** Code of the last submission, accepted or not — used in the retry prompt. */
  lastCode: string | null = null;
  /** Errors from the last rejected submission. */
  lastErrors: string[] = [];
  /** Submissions seen so far, so the planner can cap feedback rounds. */
  rounds = 0;

  get submission(): CodeGenSubmission | null {
    return this._submission;
  }

  constructor(private readonly options: SubmitCodeToolOptions = {}) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<SubmitCodeResult> {
    this.rounds++;
    this.lastCode =
      isString(params["code"]) ? params["code"] : null;
    this.lastErrors = [];

    const parsed = codeGenSubmission.safeParse(params);
    if (!parsed.success) {
      this.lastErrors = formatZodIssues(parsed.error);
      return { status: "code_rejected", errors: this.lastErrors };
    }

    const submission = parsed.data;
    this.lastCode = submission.code;

    // A port type lands verbatim on the node and decides handle compatibility,
    // so an `integer` where NodeTool means `int` produces a node that looks
    // right and will not connect. The transport schema can't catch it — custom
    // type names are open-ended — but the feedback round can.
    const typeErrors = checkPortTypes(submission);
    if (typeErrors.length > 0) {
      this.lastErrors = typeErrors;
      return { status: "code_rejected", errors: typeErrors };
    }

    // Checked after the alias pass so an aliased type is reported as the alias
    // it is, rather than as a mismatch against the handle it was seeded from.
    const seededErrors = checkSeededPorts(
      submission,
      this.options.requiredInputs ?? [],
      this.options.expectedOutput
    );
    if (seededErrors.length > 0) {
      this.lastErrors = seededErrors;
      return { status: "code_rejected", errors: seededErrors };
    }

    const analysis = analyzeGeneratedCode(
      submission.code,
      submission.outputs.map((output) => output.name)
    );
    if (!analysis.ok) {
      this.lastErrors = analysis.errors;
      return { status: "code_rejected", errors: analysis.errors };
    }

    this._submission = submission;
    this.options.onAccepted?.();
    return {
      status: "code_accepted",
      title: submission.title,
      inputs: submission.inputs.map((input) => input.name),
      outputs: submission.outputs.map((output) => output.name)
    };
  }

  userMessage(_params: Record<string, unknown>): string {
    return "Submitting generated code";
  }
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
