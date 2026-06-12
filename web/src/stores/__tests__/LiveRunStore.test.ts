import { useLiveRunStore } from "../LiveRunStore";

describe("LiveRunStore", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    useLiveRunStore.setState({ isScrubbing: false });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("turns scrubbing on immediately and off after an idle window", () => {
    expect(useLiveRunStore.getState().isScrubbing).toBe(false);

    useLiveRunStore.getState().notifyScrubActivity();
    expect(useLiveRunStore.getState().isScrubbing).toBe(true);

    // Still on just before the idle window elapses.
    jest.advanceTimersByTime(400);
    expect(useLiveRunStore.getState().isScrubbing).toBe(true);

    jest.advanceTimersByTime(100);
    expect(useLiveRunStore.getState().isScrubbing).toBe(false);
  });

  it("keeps scrubbing on while activity keeps arriving (debounced reset)", () => {
    useLiveRunStore.getState().notifyScrubActivity();
    jest.advanceTimersByTime(400);
    // New activity re-arms the timer before it fired.
    useLiveRunStore.getState().notifyScrubActivity();
    jest.advanceTimersByTime(400);
    expect(useLiveRunStore.getState().isScrubbing).toBe(true);

    jest.advanceTimersByTime(100);
    expect(useLiveRunStore.getState().isScrubbing).toBe(false);
  });
});
