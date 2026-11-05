/** Highest working color space version implemented by this build. */
export const MAX_SUPPORTED_WORKING_COLOR_SPACE_VERSION = 1;

/** Return the shared report without changing the document. */
export function timelineColorSpaceError(document: {
  workingColorSpaceVersion?: number;
}): string | null {
  const version = document.workingColorSpaceVersion;
  if (
    version === undefined ||
    (Number.isInteger(version) &&
      version > 0 &&
      version <= MAX_SUPPORTED_WORKING_COLOR_SPACE_VERSION)
  ) {
    return null;
  }
  return `Document workingColorSpaceVersion is ${JSON.stringify(version)}. This build supports versions up to ${MAX_SUPPORTED_WORKING_COLOR_SPACE_VERSION}. Open it with a build that supports this value.`;
}

/** Refuse unsupported documents before creating render resources or output. */
export function assertTimelineColorSpaceSupported(document: {
  workingColorSpaceVersion?: number;
}): void {
  const error = timelineColorSpaceError(document);
  if (error) {
    throw new Error(error);
  }
}
