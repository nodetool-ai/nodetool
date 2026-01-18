import { useAudioQueue } from "../AudioQueueStore";

describe("AudioQueueStore", () => {
  beforeEach(() => {
    useAudioQueue.setState({ currentPlayingId: null, currentPlayingItem: null, queue: [] });
  });

  it("initializes with null currentPlayingId and empty queue", () => {
    expect(useAudioQueue.getState().currentPlayingId).toBeNull();
    expect(useAudioQueue.getState().queue).toEqual([]);
  });

  it("enqueues item and plays immediately when nothing is playing", () => {
    const onPlay = jest.fn();
    const onStop = jest.fn();

    useAudioQueue.getState().enqueue({
      id: "audio-1",
      onPlay,
      onStop
    });

    expect(useAudioQueue.getState().currentPlayingId).toBe("audio-1");
    expect(useAudioQueue.getState().queue).toEqual([]);
    expect(onPlay).toHaveBeenCalled();
  });

  it("enqueues item to queue when something is playing", () => {
    const onPlay1 = jest.fn();
    const onStop1 = jest.fn();
    const onPlay2 = jest.fn();
    const onStop2 = jest.fn();

    useAudioQueue.getState().enqueue({
      id: "audio-1",
      onPlay: onPlay1,
      onStop: onStop1
    });

    useAudioQueue.getState().enqueue({
      id: "audio-2",
      onPlay: onPlay2,
      onStop: onStop2
    });

    expect(useAudioQueue.getState().currentPlayingId).toBe("audio-1");
    expect(useAudioQueue.getState().queue).toHaveLength(1);
    expect(useAudioQueue.getState().queue[0].id).toBe("audio-2");
    expect(onPlay2).not.toHaveBeenCalled();
  });

  it("removes duplicate when enqueuing same ID", () => {
    const onPlay = jest.fn();
    const onStop = jest.fn();

    useAudioQueue.getState().enqueue({
      id: "audio-1",
      onPlay,
      onStop
    });

    useAudioQueue.getState().enqueue({
      id: "audio-1",
      onPlay,
      onStop
    });

    // When same ID is enqueued while playing, it gets added to queue
    // The duplicate check only removes from queue, not from current playing
    expect(useAudioQueue.getState().queue).toHaveLength(1);
    expect(useAudioQueue.getState().queue[0].id).toBe("audio-1");
  });

  it("dequeues item that is currently playing", () => {
    const onPlay1 = jest.fn();
    const onStop1 = jest.fn();
    const onPlay2 = jest.fn();
    const onStop2 = jest.fn();

    useAudioQueue.getState().enqueue({
      id: "audio-1",
      onPlay: onPlay1,
      onStop: onStop1
    });

    useAudioQueue.getState().enqueue({
      id: "audio-2",
      onPlay: onPlay2,
      onStop: onStop2
    });

    useAudioQueue.getState().dequeue("audio-1");

    expect(onStop1).toHaveBeenCalled();
    expect(onPlay2).toHaveBeenCalled();
    expect(useAudioQueue.getState().currentPlayingId).toBe("audio-2");
    expect(useAudioQueue.getState().queue).toHaveLength(0);
  });

  it("dequeues item from queue only", () => {
    const onPlay1 = jest.fn();
    const onStop1 = jest.fn();
    const onPlay2 = jest.fn();
    const onStop2 = jest.fn();

    useAudioQueue.getState().enqueue({
      id: "audio-1",
      onPlay: onPlay1,
      onStop: onStop1
    });

    useAudioQueue.getState().enqueue({
      id: "audio-2",
      onPlay: onPlay2,
      onStop: onStop2
    });

    useAudioQueue.getState().dequeue("audio-2");

    expect(onStop1).not.toHaveBeenCalled();
    expect(onPlay2).not.toHaveBeenCalled();
    expect(useAudioQueue.getState().queue).toHaveLength(0);
  });

  it("finishes current and plays next from queue", () => {
    const onPlay1 = jest.fn();
    const onStop1 = jest.fn();
    const onPlay2 = jest.fn();
    const onStop2 = jest.fn();

    useAudioQueue.getState().enqueue({
      id: "audio-1",
      onPlay: onPlay1,
      onStop: onStop1
    });

    useAudioQueue.getState().enqueue({
      id: "audio-2",
      onPlay: onPlay2,
      onStop: onStop2
    });

    useAudioQueue.getState().finishCurrent();

    // finishCurrent doesn't call onStop - it just plays the next item
    // onStop is only called when dequeue is used to explicitly stop an item
    expect(onStop1).not.toHaveBeenCalled();
    expect(onPlay2).toHaveBeenCalled();
    expect(useAudioQueue.getState().currentPlayingId).toBe("audio-2");
    expect(useAudioQueue.getState().queue).toHaveLength(0);
  });

  it("sets currentPlayingId to null when queue is empty", () => {
    const onPlay = jest.fn();
    const onStop = jest.fn();

    useAudioQueue.getState().enqueue({
      id: "audio-1",
      onPlay,
      onStop
    });

    useAudioQueue.getState().finishCurrent();

    expect(useAudioQueue.getState().currentPlayingId).toBeNull();
    expect(useAudioQueue.getState().queue).toHaveLength(0);
  });

  it("stops all playback and clears queue", () => {
    const onPlay1 = jest.fn();
    const onStop1 = jest.fn();
    const onPlay2 = jest.fn();
    const onStop2 = jest.fn();

    useAudioQueue.getState().enqueue({
      id: "audio-1",
      onPlay: onPlay1,
      onStop: onStop1
    });

    useAudioQueue.getState().enqueue({
      id: "audio-2",
      onPlay: onPlay2,
      onStop: onStop2
    });

    useAudioQueue.getState().stopAll();

    expect(onStop1).toHaveBeenCalled();
    expect(useAudioQueue.getState().currentPlayingId).toBeNull();
    expect(useAudioQueue.getState().queue).toEqual([]);
  });

  it("checks if ID is currently playing", () => {
    const onPlay = jest.fn();
    const onStop = jest.fn();

    useAudioQueue.getState().enqueue({
      id: "audio-1",
      onPlay,
      onStop
    });

    expect(useAudioQueue.getState().isPlaying("audio-1")).toBe(true);
    expect(useAudioQueue.getState().isPlaying("audio-2")).toBe(false);
  });

  it("checks if ID is in queue", () => {
    const onPlay1 = jest.fn();
    const onStop1 = jest.fn();
    const onPlay2 = jest.fn();
    const onStop2 = jest.fn();

    useAudioQueue.getState().enqueue({
      id: "audio-1",
      onPlay: onPlay1,
      onStop: onStop1
    });

    useAudioQueue.getState().enqueue({
      id: "audio-2",
      onPlay: onPlay2,
      onStop: onStop2
    });

    expect(useAudioQueue.getState().isQueued("audio-1")).toBe(false);
    expect(useAudioQueue.getState().isQueued("audio-2")).toBe(true);
  });

  it("handles multiple items in queue", () => {
    const onPlay1 = jest.fn();
    const onStop1 = jest.fn();
    const onPlay2 = jest.fn();
    const onStop2 = jest.fn();
    const onPlay3 = jest.fn();
    const onStop3 = jest.fn();

    useAudioQueue.getState().enqueue({
      id: "audio-1",
      onPlay: onPlay1,
      onStop: onStop1
    });

    useAudioQueue.getState().enqueue({
      id: "audio-2",
      onPlay: onPlay2,
      onStop: onStop2
    });

    useAudioQueue.getState().enqueue({
      id: "audio-3",
      onPlay: onPlay3,
      onStop: onStop3
    });

    expect(useAudioQueue.getState().queue).toHaveLength(2);
    expect(useAudioQueue.getState().queue[0].id).toBe("audio-2");
    expect(useAudioQueue.getState().queue[1].id).toBe("audio-3");
  });
});
