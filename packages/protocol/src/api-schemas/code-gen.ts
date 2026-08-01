import { z } from "zod";
import { dynamicOutputTypeMetadata } from "./workflows.js";

// Transport schemas for AI-authored Code Nodes: the generation request, the
// `submit_code` tool payload, and the failure union. Validation here is
// structural only — checking that the generated JavaScript actually assigns
// every declared output needs a parser and lives in the agents package.

// ── Limits ───────────────────────────────────────────────────────────────────
// Exported so the planner, the tool, and the web dialog share one set of
// numbers instead of each restating them.

export const MAX_INSTRUCTION_LENGTH = 4000;
export const MAX_CODE_LENGTH = 20000;
export const MAX_TITLE_LENGTH = 120;
export const MAX_SUMMARY_LENGTH = 500;
export const MAX_DESCRIPTION_LENGTH = 500;
export const MAX_PORT_NAME_LENGTH = 64;
export const MAX_PORTS = 32;
/** Serialized size of the optional sample payload sent to the model. */
export const MAX_SAMPLE_VALUES_BYTES = 32 * 1024;

// ── Port names ───────────────────────────────────────────────────────────────
// Slot names become identifiers in generated code (`const { total } = input`),
// so anything that can't be destructured has to be rejected before generation.

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * ECMAScript reserved words plus the contextual ones that are unsafe as a
 * binding name in strict mode. Hardcoded rather than pulled from a parser
 * dependency — the list is fixed by the language spec.
 */
export const RESERVED_PORT_NAMES: ReadonlySet<string> = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield"
]);

export const portName = z
  .string()
  .min(1)
  .max(MAX_PORT_NAME_LENGTH)
  .regex(IDENTIFIER_PATTERN, "Port name must be a valid JavaScript identifier")
  .refine((name) => !RESERVED_PORT_NAMES.has(name), {
    message: "Port name must not be a JavaScript reserved word"
  });
export type PortName = z.infer<typeof portName>;

/** The recursive metadata shape `dynamicOutputTypeMetadata` validates. */
export interface CodeGenTypeMetadata {
  type: string;
  optional?: boolean;
  values?: (string | number)[] | null;
  type_args?: CodeGenTypeMetadata[];
  type_name?: string | null;
  [key: string]: unknown;
}

/**
 * Type metadata for a generated port. Same schema the graph uses for
 * `dynamic_outputs`, so a submission drops straight onto a node; the cast only
 * names the shape that schema already enforces.
 */
export const codeGenTypeMetadata =
  dynamicOutputTypeMetadata as z.ZodType<CodeGenTypeMetadata>;

// ── Ports ────────────────────────────────────────────────────────────────────

export const codeGenInputPort = z.object({
  name: portName,
  type: codeGenTypeMetadata,
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  default: z.unknown().optional(),
  required: z.boolean().optional()
});
export type CodeGenInputPort = z.infer<typeof codeGenInputPort>;

export const codeGenOutputPort = z.object({
  name: portName,
  type: codeGenTypeMetadata,
  description: z.string().max(MAX_DESCRIPTION_LENGTH).optional()
});
export type CodeGenOutputPort = z.infer<typeof codeGenOutputPort>;

/** Names must be unique within a direction; across directions they may repeat. */
const uniqueNames = <T extends { name: string }>(
  ports: readonly T[],
  ctx: z.RefinementCtx
): void => {
  const seen = new Set<string>();
  ports.forEach((port, index) => {
    if (seen.has(port.name)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate port name "${port.name}"`,
        path: [index, "name"]
      });
      return;
    }
    seen.add(port.name);
  });
};

const inputPorts = z
  .array(codeGenInputPort)
  .max(MAX_PORTS)
  .superRefine(uniqueNames);

const outputPorts = z
  .array(codeGenOutputPort)
  .min(1, "At least one output is required")
  .max(MAX_PORTS)
  .superRefine(uniqueNames);

// ── Request ──────────────────────────────────────────────────────────────────

/**
 * Sample values keyed by input name. Only sent when the user opts in, and
 * bounded because the whole payload goes into the prompt.
 */
export const codeGenSampleValues = z
  .record(z.string(), z.unknown())
  .refine(
    (values) => JSON.stringify(values).length <= MAX_SAMPLE_VALUES_BYTES,
    `Sample values exceed ${MAX_SAMPLE_VALUES_BYTES} bytes`
  );
export type CodeGenSampleValues = z.infer<typeof codeGenSampleValues>;

/** The output the caller wants, when generation was launched from a handle. */
export const codeGenExpectedOutput = z.object({
  name: portName,
  type: codeGenTypeMetadata
});
export type CodeGenExpectedOutput = z.infer<typeof codeGenExpectedOutput>;

export const codeGenRequest = z.object({
  instruction: z.string().trim().min(1).max(MAX_INSTRUCTION_LENGTH),
  inputs: inputPorts.default([]),
  expectedOutput: codeGenExpectedOutput.optional(),
  /** Phase-2 edit path: the node's current code and slots to revise. */
  currentCode: z.string().max(MAX_CODE_LENGTH).optional(),
  currentInputs: inputPorts.optional(),
  currentOutputs: z
    .array(codeGenOutputPort)
    .max(MAX_PORTS)
    .superRefine(uniqueNames)
    .optional(),
  sampleValues: codeGenSampleValues.optional(),
  provider: z.string().min(1),
  model: z.string().min(1)
});
export type CodeGenRequest = z.infer<typeof codeGenRequest>;

// ── Submission ───────────────────────────────────────────────────────────────

/** The arguments of an accepted `submit_code` tool call. */
export const codeGenSubmission = z.object({
  /** Imperative phrase; becomes the node title. */
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  summary: z.string().trim().min(1).max(MAX_SUMMARY_LENGTH),
  code: z.string().min(1).max(MAX_CODE_LENGTH),
  inputs: inputPorts,
  outputs: outputPorts
});
export type CodeGenSubmission = z.infer<typeof codeGenSubmission>;

// ── Errors ───────────────────────────────────────────────────────────────────

export const codeGenErrorCodes = [
  "disabled",
  "provider_unavailable",
  "aborted",
  "no_valid_submission",
  "rate_limited",
  "internal"
] as const;
export type CodeGenErrorCode = (typeof codeGenErrorCodes)[number];

export const codeGenError = z.discriminatedUnion("code", [
  /** The deployment has not turned code generation on. */
  z.object({
    code: z.literal("disabled"),
    message: z.string()
  }),
  z.object({
    code: z.literal("provider_unavailable"),
    message: z.string(),
    provider: z.string().optional()
  }),
  z.object({
    code: z.literal("aborted"),
    message: z.string()
  }),
  z.object({
    code: z.literal("no_valid_submission"),
    message: z.string(),
    /** Validation failures fed back to the model, newest last. */
    issues: z.array(z.string()).default([]),
    rounds: z.number().int().min(0).optional()
  }),
  z.object({
    code: z.literal("rate_limited"),
    message: z.string(),
    retryAfterMs: z.number().int().min(0).optional()
  }),
  z.object({
    code: z.literal("internal"),
    message: z.string()
  })
]);
export type CodeGenError = z.infer<typeof codeGenError>;

export const codeGenResponse = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), submission: codeGenSubmission }),
  z.object({ status: z.literal("error"), error: codeGenError })
]);
export type CodeGenResponse = z.infer<typeof codeGenResponse>;
