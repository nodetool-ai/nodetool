/**
 * Module-mock factories shared by the clip-gesture suites. Jest hoists
 * `jest.mock` per test file, so each suite still calls it with its own
 * relative path and delegates the factory here:
 *
 *   jest.mock("../../../../stores/ErrorStore", () =>
 *     jest.requireActual("<rel>/test-utils/timelineClipMocks").errorStoreMock()
 *   );
 */

export const clipThumbnailsMock = () => ({
  useClipThumbnails: () => null
});

export const audioPeaksMock = () => ({
  useAudioPeaks: () => ({ peaks: null, durationMs: null })
});

export const assetStoreMock = () => ({
  useAssetStore: <T>(sel: (s: { get: () => Promise<null> }) => T) =>
    sel({ get: () => Promise.resolve(null) })
});

export const workflowRunsStoreMock = () => ({
  __esModule: true,
  default: <T>(sel: (s: { focusedJob: Record<string, string> }) => T) =>
    sel({ focusedJob: {} })
});

export const errorStoreMock = () => ({
  __esModule: true,
  default: <T>(sel: (s: { errors: Record<string, unknown> }) => T) =>
    sel({ errors: {} }),
  hasNodeError: () => false,
  nodeErrorToDisplayString: () => ""
});

export const timelineGenerationStoreMock = () => ({
  useTimelineGenerationStore: <T>(
    sel: (s: { clipJobs: Record<string, unknown> }) => T
  ) => sel({ clipJobs: {} })
});
