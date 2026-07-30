/**
 * SubmitCodeTool -- the `submit_code` analog of `submit_graph`.
 *
 * The model submits the whole Code node — title, summary, code, typed input and
 * output slots — as one tool call. Transport shape is checked with the protocol
 * schema, then the code is parsed and every declared output is verified on every
 * visible return path. Failures come back as the tool result, so the model fixes
 * the submission over feedback rounds instead of the planner re-prompting from
 * scratch.
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
  type CodeGenSubmission
} from "@nodetool-ai/protocol/api-schemas/code-gen.js";
import { z } from "zod";
import { Tool } from "./base-tool.js";
import { analyzeGeneratedCode } from "../code-gen/analyze.js";

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
  required: ["type"] as string[]
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
        required: ["name", "type"] as string[]
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
        required: ["name", "type"] as string[]
      }
    }
  },
  required: ["title", "summary", "code", "inputs", "outputs"] as string[]
};

export interface SubmitCodeToolOptions {
  /** Fired once a submission is accepted, so the planner can end its loop. */
  onAccepted?: () => void;
}

export class SubmitCodeTool extends Tool {
  readonly name = "submit_code";
  readonly description =
    "Submit the finished Code node: title, summary, code, and typed input and " +
    "output slots. Returns the validation errors to fix (resubmit the full " +
    "corrected node), or accepts the submission.";
  readonly jsonSchema: Record<string, unknown> = SUBMIT_CODE_INPUT_SCHEMA;

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
  ): Promise<unknown> {
    this.rounds++;
    this.lastCode =
      typeof params["code"] === "string" ? (params["code"] as string) : null;
    this.lastErrors = [];

    const parsed = codeGenSubmission.safeParse(params);
    if (!parsed.success) {
      this.lastErrors = formatZodIssues(parsed.error);
      return { status: "code_rejected", errors: this.lastErrors };
    }

    const submission = parsed.data;
    this.lastCode = submission.code;

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
