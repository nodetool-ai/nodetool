import { createGameProfiler, GameProfileRingBuffer } from "../gameProfiler";

describe("GameProfileRingBuffer", () => {
  it("keeps the newest items in order and counts the ones it overwrote", () => {
    const buffer = new GameProfileRingBuffer<number>(3);
    expect(buffer.toArray()).toEqual([]);
    buffer.push(1);
    buffer.push(2);
    expect(buffer.toArray()).toEqual([1, 2]);
    expect(buffer.overwritten).toBe(0);
    for (const value of [3, 4, 5]) { buffer.push(value); }
    expect(buffer.toArray()).toEqual([3, 4, 5]);
    expect(buffer.size).toBe(3);
    expect(buffer.overwritten).toBe(2);
    buffer.clear();
    expect(buffer.toArray()).toEqual([]);
    expect(buffer.overwritten).toBe(0);
    buffer.push(6);
    expect(buffer.toArray()).toEqual([6]);
  });

  it("stays linear and bounded across many pushes", () => {
    const buffer = new GameProfileRingBuffer<number>(600);
    for (let value = 0; value < 200_000; value++) { buffer.push(value); }
    const items = buffer.toArray();
    expect(items).toHaveLength(600);
    expect(items[0]).toBe(199_400);
    expect(items[599]).toBe(199_999);
  });

  it("rejects a capacity that is not a positive integer", () => {
    expect(() => new GameProfileRingBuffer(0)).toThrow("positive integer");
    expect(() => new GameProfileRingBuffer(1.5)).toThrow("positive integer");
  });
});

describe("createGameProfiler", () => {
  const timings = { systems: [{ system: "scripts", durationMs: 1.5 }, { system: "physics", durationMs: 0.5 }], totalMs: 2.5 };

  it("records nothing until a view attaches", () => {
    const profiler = createGameProfiler();
    profiler.recordRender({ drawCalls: 4, textureBytes: 64 }, 0);
    profiler.recordStep({ tick: 1, timings });
    expect(profiler.recording()).toBe(false);
    expect(profiler.samples()).toEqual([]);
    expect(profiler.version()).toBe(0);
    const detach = profiler.attach();
    profiler.recordStep({ tick: 2, timings });
    expect(profiler.samples()).toHaveLength(1);
    detach();
    detach();
    expect(profiler.recording()).toBe(false);
  });

  it("merges the latest renderer stats and frame time into each step sample", () => {
    const profiler = createGameProfiler();
    profiler.attach();
    profiler.recordRender({ drawCalls: 3, textureBytes: 1024, triangles: 12, geometryBytes: 2048 }, 1000);
    profiler.recordStep({ tick: 1, timings, physics: { bodies: 5, contacts: 2 }, voices: 1,
      scriptStats: { durationMs: 1.2, calls: 3, commands: 4, byEntity: { player: { durationMs: 1.2, calls: 3 } } } });
    profiler.recordRender({ drawCalls: 4, textureBytes: 1024, triangles: 16, geometryBytes: 2048 }, 1016);
    profiler.recordStep({ tick: 2 });
    // A gap longer than a second is a pause, not a slow frame.
    profiler.recordRender({ drawCalls: 4, textureBytes: 1024 }, 5000);
    profiler.recordStep({ tick: 3 });
    const [first, second, third] = profiler.samples();
    expect(first).toEqual({ tick: 1, stepMs: 2.5, systems: timings.systems, scriptMs: 1.2, scriptCalls: 3,
      scriptsByEntity: { player: { durationMs: 1.2, calls: 3 } }, drawCalls: 3, textureBytes: 1024, triangles: 12, geometryBytes: 2048,
      bodies: 5, contacts: 2, voices: 1 });
    expect(second).toEqual({ tick: 2, frameMs: 16, drawCalls: 4, textureBytes: 1024, triangles: 16, geometryBytes: 2048 });
    expect(third).toEqual({ tick: 3, drawCalls: 4, textureBytes: 1024 });
  });

  it("keeps a bounded live window and a separate capture", () => {
    const profiler = createGameProfiler(2, 3);
    profiler.attach();
    profiler.recordStep({ tick: 1 });
    profiler.startCapture(10_000);
    expect(profiler.capturing()).toBe(true);
    for (const tick of [2, 3, 4, 5]) { profiler.recordStep({ tick }); }
    expect(profiler.samples().map((sample) => sample.tick)).toEqual([4, 5]);
    const capture = profiler.stopCapture(12_500);
    expect(capture).toEqual({ startedAt: 10_000, endedAt: 12_500, truncated: true,
      samples: [{ tick: 3 }, { tick: 4 }, { tick: 5 }] });
    expect(profiler.capture()).toBe(capture);
    expect(profiler.capturing()).toBe(false);
    profiler.recordStep({ tick: 6 });
    expect(profiler.capture()?.samples).toHaveLength(3);
    profiler.clear();
    expect(profiler.samples()).toEqual([]);
    expect(profiler.capture()).toBeNull();
  });

  it("keeps recording while a capture runs with no view attached", () => {
    const profiler = createGameProfiler();
    profiler.startCapture(0);
    profiler.recordStep({ tick: 1 });
    expect(profiler.stopCapture(100)?.samples).toEqual([{ tick: 1 }]);
    expect(profiler.recording()).toBe(false);
  });
});
