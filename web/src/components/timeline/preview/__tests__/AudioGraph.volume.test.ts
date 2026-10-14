/**
 * The listener volume scales the master gain, survives a context created
 * after it was set, and is clamped to 0..1.
 */
import { AudioGraph } from "../AudioGraph";

function fakeContext() {
  const gains: Array<{
    gain: {
      value: number;
      setTargetAtTime: jest.Mock;
      cancelScheduledValues: jest.Mock;
    };
  }> = [];
  const ctx = {
    currentTime: 3,
    destination: {},
    createGain: jest.fn(() => {
      const node = {
        gain: {
          value: 1,
          setTargetAtTime: jest.fn(),
          cancelScheduledValues: jest.fn()
        },
        connect: jest.fn(),
        disconnect: jest.fn()
      };
      gains.push(node);
      return node;
    })
  };
  return { ctx: ctx as unknown as BaseAudioContext, gains };
}

describe("AudioGraph master volume", () => {
  it("applies a volume set before the context exists", () => {
    const { ctx, gains } = fakeContext();
    const graph = new AudioGraph(ctx);
    graph.setMasterVolume(0.25);
    graph.getContext();
    expect(gains[0].gain.value).toBe(0.25);
  });

  it("glides the live master gain to the new volume", () => {
    const { ctx, gains } = fakeContext();
    const graph = new AudioGraph(ctx);
    graph.getContext();
    graph.setMasterVolume(0.5);
    expect(gains[0].gain.cancelScheduledValues).toHaveBeenCalledWith(3);
    expect(gains[0].gain.setTargetAtTime).toHaveBeenCalledWith(0.5, 3, 0.01);
  });

  it("clamps the volume to 0..1", () => {
    const { ctx, gains } = fakeContext();
    const graph = new AudioGraph(ctx);
    graph.getContext();
    graph.setMasterVolume(4);
    graph.setMasterVolume(-1);
    expect(gains[0].gain.setTargetAtTime.mock.calls.map((c) => c[0])).toEqual([
      1, 0
    ]);
  });
});
