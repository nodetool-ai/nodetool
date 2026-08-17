/**
 * Builds the report bundle the bug-report dialog produces: a zip the
 * reporter drags into a GitHub issue.
 *
 * Everything here is redacted before it reaches a file. Two passes do it:
 * `redactDeep` for structured data (graphs, node properties), where a
 * secret-looking *key* is enough to drop the value, and `redactSecretsInText`
 * for free text (logs, stack traces), where only the value's shape gives it
 * away.
 */
import { strToU8, zipSync } from "fflate";
import { SECRET_KEY_RE } from "./bugReport";
import { isObjectLike, isString } from "./typePredicates";

const REDACTED = "«redacted»";

/** A single string in structured data is capped here. Keeps base64 blobs out. */
const MAX_STRING_CHARS = 2000;

/** Recursion depth cap. A graph is shallow; a cycle is not. */
const MAX_DEPTH = 12;

const DATA_URI_RE = /^data:([\w/+.-]+)?(;base64)?,/i;

/**
 * Value shapes that identify a credential on their own. Ordered by
 * specificity; each is replaced wholesale rather than partially masked,
 * because a prefix is often enough to identify an account.
 */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[A-Za-z0-9_-]{30,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
  /\b(api[_-]?key|secret|token|password|credential)["'\s]*[:=]["'\s]*[^\s"',}]{8,}/gi
];

/** Replace credential-shaped substrings and inlined media in free text. */
export function redactSecretsInText(text: string): string {
  let result = text;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result.replace(
    /data:([\w/+.-]+)?(;base64)?,[A-Za-z0-9+/=]{100,}/g,
    (_match, mime: string | undefined) => `<inline ${mime ?? "data"}>`
  );
}

/**
 * Copy a value with secret-keyed entries dropped, long strings truncated, and
 * inlined media collapsed. Unknown shapes survive as-is so the report stays
 * useful for node types this code has never seen.
 */
export function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return "<max depth>";
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (isString(value)) {
    if (DATA_URI_RE.test(value)) {
      const mime = value.match(DATA_URI_RE)?.[1] ?? "data";
      return `<inline ${mime}, ${value.length} chars>`;
    }
    const redacted = redactSecretsInText(value);
    return redacted.length <= MAX_STRING_CHARS
      ? redacted
      : `${redacted.slice(0, MAX_STRING_CHARS)}… (${redacted.length} chars)`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item, depth + 1));
  }
  if (isObjectLike(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = SECRET_KEY_RE.test(key)
        ? REDACTED
        : redactDeep(entry, depth + 1);
    }
    return result;
  }
  return value;
}

/** Where the report was started from. Sets the issue title and the context. */
export type BugReportSource =
  | "node-error"
  | "app-crash"
  | "panel-crash"
  | "job-failure"
  | "notification"
  | "manual";

const SOURCE_LABELS: Record<BugReportSource, string> = {
  "node-error": "Node error",
  "app-crash": "App crash",
  "panel-crash": "Panel crash",
  "job-failure": "Job failure",
  notification: "Error notification",
  manual: "Manual report"
};

export function sourceLabel(source: BugReportSource): string {
  return SOURCE_LABELS[source];
}

/** What the surface that opened the dialog knows about the failure. */
export interface BugReportContext {
  source: BugReportSource;
  /** One-line summary used for the issue title. */
  summary?: string;
  errorText?: string;
  stackTrace?: string;
  nodeType?: string;
  nodeTitle?: string;
  nodeId?: string;
  workflowId?: string;
  jobId?: string;
  /**
   * The failing node's settings and wiring, already formatted. The dialog
   * cannot read them itself — the node store is scoped to the editor.
   */
  nodeDetail?: string;
}

/** One attachable file, shown as its own consent row in the dialog. */
export interface BundleSection {
  id: string;
  label: string;
  /** What the file holds, in the reporter's words. */
  description: string;
  fileName: string;
  content: string;
  /** Optional sections start unchecked when they hold nothing useful. */
  defaultIncluded: boolean;
}

export interface BundleInput {
  context: BugReportContext;
  systemInfo: string;
  /** The open workflow, as returned by the workflow store. */
  workflow?: unknown;
  /** Node configuration and wiring, when a node failed. */
  nodeDetail?: string;
  logText?: string;
  consoleText?: string;
  notificationText?: string;
}

function errorSectionContent(context: BugReportContext): string {
  const parts: string[] = [];
  if (context.errorText) {
    parts.push(context.errorText);
  }
  if (context.stackTrace) {
    parts.push("", "--- Stack trace ---", context.stackTrace);
  }
  return redactSecretsInText(parts.join("\n")) || "(no error text captured)";
}

/**
 * The optional attachments, in the order the dialog lists them. `report.md`
 * and `system.txt` are added at zip time because they depend on the form.
 */
export function buildBundleSections(input: BundleInput): BundleSection[] {
  const sections: BundleSection[] = [];
  const { context } = input;

  if (context.errorText || context.stackTrace) {
    sections.push({
      id: "error",
      label: "Error and stack trace",
      description: "The message and stack trace of the failure.",
      fileName: "error.txt",
      content: errorSectionContent(context),
      defaultIncluded: true
    });
  }

  if (input.nodeDetail) {
    sections.push({
      id: "node",
      label: "Node configuration",
      description:
        "The failing node's settings and the nodes wired into it. API keys are removed.",
      fileName: "node.txt",
      content: redactSecretsInText(input.nodeDetail),
      defaultIncluded: true
    });
  }

  if (input.workflow !== undefined) {
    sections.push({
      id: "workflow",
      label: "Workflow graph",
      description:
        "The whole open workflow: node types, settings and connections. Prompts are part of this.",
      fileName: "workflow.json",
      content: JSON.stringify(redactDeep(input.workflow), null, 2),
      defaultIncluded: true
    });
  }

  if (input.logText) {
    sections.push({
      id: "logs",
      label: "Workflow logs",
      description: "The log lines the run produced.",
      fileName: "logs.txt",
      content: redactSecretsInText(input.logText),
      defaultIncluded: true
    });
  }

  if (input.consoleText) {
    sections.push({
      id: "console",
      label: "Console output",
      description:
        "Browser console messages and uncaught errors from this session.",
      fileName: "console.txt",
      content: redactSecretsInText(input.consoleText),
      defaultIncluded: true
    });
  }

  if (input.notificationText) {
    sections.push({
      id: "notifications",
      label: "Recent notifications",
      description: "The in-app messages shown before the failure.",
      fileName: "notifications.txt",
      content: redactSecretsInText(input.notificationText),
      defaultIncluded: false
    });
  }

  return sections;
}

export interface ReportFormFields {
  description: string;
  steps: string;
  expected: string;
}

export interface IssueBodyInput extends ReportFormFields {
  context: BugReportContext;
  systemInfo: string;
  /** File names present in the bundle, listed so a maintainer knows to look. */
  bundleFileNames: string[];
  bundleFileName?: string;
}

/** GitHub rejects very long URLs; the bundle carries the detail instead. */
const MAX_ISSUE_BODY_CHARS = 6000;

export function buildIssueBody(input: IssueBodyInput): string {
  const { context } = input;
  const contextLines: string[] = [`Reported from: ${sourceLabel(context.source)}`];
  if (context.nodeType) {
    contextLines.push(
      `Node: \`${context.nodeType}\`${context.nodeTitle ? ` ("${context.nodeTitle}")` : ""}`
    );
  }
  if (context.workflowId) {
    contextLines.push(`Workflow: \`${context.workflowId}\``);
  }
  if (context.jobId) {
    contextLines.push(`Job: \`${context.jobId}\``);
  }

  const attachment = input.bundleFileName
    ? `A report bundle was saved as \`${input.bundleFileName}\`. **Please drag it into this issue** before submitting. It contains:\n${input.bundleFileNames
        .map((name) => `- \`${name}\``)
        .join("\n")}`
    : "No report bundle was attached.";

  const errorBlock = context.errorText
    ? `\n### Error\n\n\`\`\`\n${redactSecretsInText(context.errorText).slice(0, 1500)}\n\`\`\`\n`
    : "";

  const body = `### Describe the bug

${input.description || "(not provided)"}

### Steps to reproduce

${input.steps || "(not provided)"}

### Expected behavior

${input.expected || "(not provided)"}

### Context

${contextLines.join("\n")}
${errorBlock}
### Attached files

${attachment}

### System information

\`\`\`
${input.systemInfo}
\`\`\`

---
*Created by the Report a Bug dialog in NodeTool.*
`;

  return body.length <= MAX_ISSUE_BODY_CHARS
    ? body
    : `${body.slice(0, MAX_ISSUE_BODY_CHARS)}\n… (truncated — see the attached bundle)`;
}

export function buildIssueTitle(
  context: BugReportContext,
  description: string
): string {
  const subject =
    description.split("\n")[0].trim() ||
    context.summary ||
    context.errorText?.split("\n")[0] ||
    sourceLabel(context.source);
  const prefix = context.nodeType ? `${context.nodeType}: ` : "";
  return `[Bug]: ${prefix}${subject}`.slice(0, 120);
}

export function buildIssueUrl(baseUrl: string, body: string, title: string): string {
  const search = new URLSearchParams({ title, body, labels: "bug" });
  return `${baseUrl}?${search.toString()}`;
}

/** The report the bundle leads with, so a maintainer reads prose first. */
export function buildBundleReadme(
  input: Omit<IssueBodyInput, "bundleFileName">
): string {
  return buildIssueBody({ ...input, bundleFileName: undefined });
}

export interface BundleFile {
  name: string;
  /** Text sections and user-attached binaries both land here. */
  content: string | Uint8Array;
}

export function zipBundle(files: BundleFile[]): Blob {
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[file.name] = isString(file.content)
      ? strToU8(file.content)
      : file.content;
  }
  const zipped = zipSync(entries);
  // fflate may hand back a view into a pooled buffer; Blob needs the exact bytes.
  const bytes = zipped.buffer.slice(
    zipped.byteOffset,
    zipped.byteOffset + zipped.byteLength
  );
  return new Blob([bytes], { type: "application/zip" });
}

export function bundleFileName(context: BugReportContext, now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `nodetool-bug-${context.source}-${stamp}.zip`;
}
