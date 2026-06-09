import type { InputMode, OutputCorrelation } from "@nodetool-ai/protocol";

export interface CorrelationValidationIssue {
  nodeType: string;
  handle?: string;
  message: string;
}

export class CorrelationMetadataError extends Error {
  readonly issues: readonly CorrelationValidationIssue[];

  constructor(issues: readonly CorrelationValidationIssue[]) {
    const first = issues[0]!;
    const summary =
      issues.length === 1
        ? `${first.nodeType}: ${first.message}`
        : `${issues.length} correlation metadata issues:\n` +
          issues
            .map(
              (i) =>
                `  - ${i.nodeType}${i.handle ? `.${i.handle}` : ""}: ${i.message}`
            )
            .join("\n");
    super(summary);
    this.name = "CorrelationMetadataError";
    this.issues = issues;
  }
}

/**
 * Descriptor-level validation of `output_correlation` per docs/correlation-design.md §3.
 *
 * Only checks rules that depend solely on the node metadata. Graph-topology rules
 * (multi-edge list source scopes, strict-prefix invocation scope, Zip constraints)
 * belong to the static-correlation analyzer added in PR 3.
 */
export function validateOutputCorrelation(
  nodeType: string,
  inputMode: InputMode | undefined,
  outputCorrelation: Record<string, OutputCorrelation> | undefined,
  declaredOutputs: readonly string[]
): CorrelationValidationIssue[] {
  if (!outputCorrelation) return [];

  const issues: CorrelationValidationIssue[] = [];
  const groupSources = new Map<string, string>();
  const declaredOutputSet = new Set(declaredOutputs);

  for (const [handle, corr] of Object.entries(outputCorrelation)) {
    if (!corr.source) {
      issues.push({
        nodeType,
        handle,
        message: `output "${handle}" must declare an explicit source (use "__execution__" or an input handle name)`
      });
      continue;
    }

    if (corr.kind === "forward") {
      if (corr.source === "__execution__") {
        issues.push({
          nodeType,
          handle,
          message: `forward output "${handle}" cannot use source "__execution__"; specify an input handle`
        });
      }
    }

    if (corr.kind === "aggregate") {
      if (!corr.collapse) {
        issues.push({
          nodeType,
          handle,
          message: `aggregate output "${handle}" must declare a collapse spec (e.g. "innermost")`
        });
      }
      if (inputMode === "buffered") {
        issues.push({
          nodeType,
          handle,
          message: `aggregate output "${handle}" is not allowed on buffered nodes; set input_mode: "stream"`
        });
      }
    }

    if (corr.kind === "iteration" && corr.group) {
      const existing = groupSources.get(corr.group);
      if (existing !== undefined && existing !== corr.source) {
        issues.push({
          nodeType,
          handle,
          message: `iteration group "${corr.group}" has conflicting sources: "${existing}" and "${corr.source}" — handles in one group must share one source`
        });
      } else {
        groupSources.set(corr.group, corr.source);
      }
    }

    if (declaredOutputSet.size > 0 && !declaredOutputSet.has(handle)) {
      issues.push({
        nodeType,
        handle,
        message: `output_correlation references handle "${handle}" not in declared outputs`
      });
    }
  }

  // Every declared output must have a correlation entry. A node may opt out
  // of correlation entirely by leaving output_correlation undefined; once it
  // declares any entry it has committed to the per-output contract.
  // Stryker disable next-line ConditionalExpression,EqualityOperator: the guard only short-circuits an empty set; the loop body is a no-op for size 0, so size > 0 vs size >= 0 vs always-true are indistinguishable (equivalent).
  if (declaredOutputSet.size > 0) {
    for (const handle of declaredOutputSet) {
      if (!(handle in outputCorrelation)) {
        issues.push({
          nodeType,
          handle,
          message: `declared output "${handle}" is missing a correlation entry`
        });
      }
    }
  }

  return issues;
}
