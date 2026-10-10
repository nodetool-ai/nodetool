/**
 * @jest-environment jsdom
 *
 * "Extract as script" reads the live clips the caller passes, so an edit that
 * autosave has not written yet still reaches the script (S10).
 */
import { renderHook, act } from "@testing-library/react";
import { makeClip } from "@nodetool-ai/timeline";
import type { TimelineClip } from "@nodetool-ai/timeline";

const timelineGet = jest.fn();
const scriptsCreate = jest.fn();
jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    timeline: { get: { query: (...a: unknown[]) => timelineGet(...a) } },
    scripts: { create: { mutate: (...a: unknown[]) => scriptsCreate(...a) } }
  }
}));

import { useExtractScript } from "../useExtractScript";

const voiced = (word: string): TimelineClip =>
  makeClip({
    id: "c1",
    paragraphId: "c1",
    trackId: "audio",
    mediaType: "audio",
    bindingKind: "text-to-audio",
    sourceType: "generated",
    status: "generated",
    startMs: 0,
    durationMs: 900,
    currentAssetId: "asset-1",
    caption: { words: [{ word, startMs: 0, endMs: 900 }] }
  });

beforeEach(() => {
  timelineGet.mockReset().mockResolvedValue({
    id: "t1",
    name: "Cut",
    projectId: "p1",
    clips: [voiced("saved")]
  });
  scriptsCreate.mockReset().mockResolvedValue({
    id: "s1",
    projectId: "p1",
    updatedAt: "2026-01-01T00:00:00.000Z"
  });
});

it("builds the script from the live clips, not the last saved copy", async () => {
  const { result } = renderHook(() => useExtractScript());
  await act(async () => {
    await result.current.extract("t1", [voiced("unsaved")]);
  });
  const document = JSON.stringify(scriptsCreate.mock.calls[0][0].document);
  expect(document).toContain("unsaved");
  expect(document).not.toContain('"text":"saved"');
});
