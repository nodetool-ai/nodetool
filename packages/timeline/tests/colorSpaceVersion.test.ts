import { expect, it } from "vitest";
import { assertTimelineColorSpaceSupported, timelineColorSpaceError } from "../src/colorSpaceVersion.js";
it.each([undefined, 1, 2, 3])("reports %s without rewriting input", (version) => {
  const document = version === undefined ? { clips: [] } : { clips: [], workingColorSpaceVersion: version };
  const before = JSON.stringify(document);
  if (version === undefined || version === 1) {
    expect(timelineColorSpaceError(document)).toBeNull();
    expect(() => assertTimelineColorSpaceSupported(document)).not.toThrow();
  } else {
    expect(() => assertTimelineColorSpaceSupported(document)).toThrow(`Document workingColorSpaceVersion is ${version}. This build supports versions up to 1. Open it with a build that supports this value.`);
  }
  expect(JSON.stringify(document)).toBe(before);
});
