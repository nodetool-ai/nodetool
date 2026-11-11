import { HEADLESS_RENDER_ENTRY, type HeadlessRenderRequest } from "@nodetool-ai/timeline/render";
import { renderTimeline } from "../../TimelineRenderer";

jest.mock("../../TimelineRenderer", () => ({ renderTimeline: jest.fn() }));
jest.mock("mediabunny", () => ({ canEncodeVideo: jest.fn() }));
import "../renderPage";

it.each([2, 3])("refuses headless page version %s before encoding or output", async (workingColorSpaceVersion) => {
  const request: HeadlessRenderRequest = {
    workingColorSpaceVersion, tracks: [], clips: [], width: 32, height: 32,
    referenceWidth: 32, referenceHeight: 32, fps: 30, durationMs: 1000,
    alpha: false, bitrate: 0, motionBlur: { samplesPerFrame: 1, shutterAngle: 180 }, encodings: []
  };
  const saved = JSON.stringify(request);
  await expect(window[HEADLESS_RENDER_ENTRY]!(request)).rejects.toThrow(`Document workingColorSpaceVersion is ${workingColorSpaceVersion}. This build supports versions up to 1. Open it with a build that supports this value.`);
  expect(renderTimeline).not.toHaveBeenCalled();
  expect(JSON.stringify(request)).toBe(saved);
});
