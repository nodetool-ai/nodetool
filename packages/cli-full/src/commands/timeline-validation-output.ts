/**
 * Human-readable rendering of a `TimelineValidation`, shared by
 * `timeline validate` and `timeline versions restore`.
 */
import type {
  TimelineDebugIssue,
  TimelineValidation
} from "@nodetool-ai/execution/timeline-debug";
import { issueLocation, renderValidation } from "./validation-output.js";

export function renderTimelineValidation(
  validation: TimelineValidation
): string[] {
  return renderValidation(validation, (issue: TimelineDebugIssue) =>
    issue.clipId != null
      ? ` [clip ${issue.clipId}]`
      : issue.trackId != null
        ? ` [track ${issue.trackId}]`
        : issueLocation(issue)
  );
}
