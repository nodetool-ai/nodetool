/**
 * Human-readable rendering of a `SketchValidation`, shared by
 * `sketch validate` and `sketch versions restore`.
 */
import type {
  SketchDebugIssue,
  SketchValidation
} from "@nodetool-ai/execution/sketch-debug";
import { issueLocation, renderValidation } from "@nodetool-ai/cli-common/commands/validation-output";

export function renderSketchValidation(validation: SketchValidation): string[] {
  return renderValidation(validation, (issue: SketchDebugIssue) =>
    issue.layerId != null ? ` [layer ${issue.layerId}]` : issueLocation(issue)
  );
}
