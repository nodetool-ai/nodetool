import { missingRuntimePackageError } from "@nodetool-ai/protocol";

/** A failure to load the optional node-av or Mediabunny server packages. */
function isMissingCodecs(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /node-av|@mediabunny\/server/.test(message);
}

/**
 * The media module, loaded on demand. It loads node-av's native addon, which
 * no browser, edge or Turbopack bundle can place, so those bundlers are told
 * to leave the import alone. esbuild ignores the hint and inlines it, which is
 * what the packaged backend needs.
 *
 * node-av is the optional `media-codecs` runtime package. When it is absent,
 * the error names the package and how to install it.
 */
export async function loadMediaModule(): Promise<typeof import("./media/index.js")> {
  try {
    return await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "./media/index.js");
  } catch (cause) {
    if (isMissingCodecs(cause)) { throw missingRuntimePackageError("node-av", "media-codecs", cause); }
    throw cause;
  }
}
