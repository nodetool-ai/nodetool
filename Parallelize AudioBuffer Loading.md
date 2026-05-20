# What
Modified `AudioGraph.ts` to fetch required audio buffers concurrently using `Promise.all` instead of sequentially awaiting each `loadBuffer` call inside the scheduling loop.

# Why
During `scheduleClips`, multiple audio clips might require new audio assets to be fetched over the network. Sequentially fetching them creates a waterfall effect, significantly delaying the start of audio playback and causing lag.

# Impact
Substantially reduces the latency of `scheduleClips` when loading multiple assets, scaling the loading time to the slowest individual request rather than the sum of all requests.

# Measurement
Created `web/src/components/timeline/preview/__tests__/AudioGraph.perf.test.ts`.
- **Baseline:** 3 mocked buffers taking 500ms each fetched sequentially took ~1505ms.
- **Improvement:** The same 3 mocked buffers fetched concurrently took ~505ms.
- **Change:** ~66% reduction in scheduling time (proportional to `N` buffers).

# Testing
Ran the `web/src/components/timeline/preview/__tests__/AudioGraph.perf.test.ts` to ensure the performance gain is valid. Also confirmed that `jest.restoreAllMocks()` prevents test pollution and ran standard linting.
