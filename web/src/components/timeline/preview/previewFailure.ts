import { redactSecretsInText } from "../../../utils/bugReportBundle";

export interface PreviewFailure {
  readonly stage: string;
  readonly error: unknown;
  readonly resourceId?: string;
  readonly detail?: string;
}

export type PreviewFailureHandler = (failure: PreviewFailure) => void;

export function previewFailureText(failure: PreviewFailure): string {
  const error = failure.error;
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  const cause =
    error instanceof Error && error.cause instanceof Error
      ? `\nCaused by: ${error.cause.stack ?? error.cause.message}`
      : "";
  // Browser errors can contain signed media URLs. Keep identifiers, never URL credentials.
  return redactSecretsInText(
    `${failure.stage}${failure.resourceId ? ` (${failure.resourceId})` : ""}: ${message}${cause}\n${failure.detail ?? ""}`.replace(
      /https?:\/\/[^\s)"']+/g,
      "[media URL]"
    )
  );
}

export function logPreviewFailure(failure: PreviewFailure): void {
  console.error(
    JSON.stringify({
      level: "error",
      timestamp: new Date().toISOString(),
      source: "timeline-preview",
      stage: failure.stage,
      resourceId: failure.resourceId,
      message: previewFailureText(failure)
    })
  );
}

export function previewFailureMessage(stage: string): string {
  if (stage.startsWith("video")) {
    return "The video preview stopped decoding. Check that the source video is available and playable.";
  }
  if (stage === "asset" || stage === "image") {
    return "Preview media could not be loaded. Check your connection and the source asset.";
  }
  return "The preview renderer stopped working. Retry the preview or reload this tab.";
}
