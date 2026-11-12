// Importing the real EXIF package detects partial navigator objects even when
// no EXIF block exists in the test image. Its startup reads userAgent.includes.
try {
  await import("exifr");
} catch (error) {
  globalThis.__host.log(
    "error",
    `G5_NAVIGATOR ${JSON.stringify(Object.keys(globalThis.navigator ?? {}))} ${String(error)} ${error.stack ?? ""}`
  );
  throw error;
}
if (
  globalThis.navigator &&
  (typeof navigator.userAgent !== "string" ||
    typeof navigator.platform !== "string")
)
  throw new Error("Native navigator compatibility fields are incomplete");
