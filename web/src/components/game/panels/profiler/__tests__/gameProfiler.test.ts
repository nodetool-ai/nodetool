import {
  createGameProfiler, GAME_PROFILER_CAPTURE_BYTE_LIMIT, GAME_PROFILER_CAPTURE_FRAMES, GAME_PROFILER_CAPTURE_TICKS, GAME_PROFILER_MAX_SCRIPT_ENTITIES,
  GAME_PROFILER_OTHER_ENTITIES, GameProfileBuffer, type GameProfilerStep
} from "../gameProfiler";

const timings = { systems: [{ system: "scripts", durationMs: 1.5 }, { system: "physics", durationMs: 0.5 }], totalMs: 2.5 };

function scriptStep(tick: number, entities: number): GameProfilerStep {
  const byEntity: Record<string, { durationMs: number; calls: number }> = {};
  for (let entity = 0; entity < entities; entity++) {
    byEntity[`entity-${entity.toString().padStart(30, "0")}`] = { durationMs: (entity % 7) / 100, calls: 1 };
  }
  return { tick, timings, scriptStats: { durationMs: 1, calls: entities, commands: entities, byEntity }, physics: { bodies: 30, contacts: 3 }, voices: 2 };
}

describe("GameProfileBuffer", () => {
  it("keeps the newest rows in order when it overwrites", () => {
    const buffer = new GameProfileBuffer(3, 3, true);
    for (const tick of [1, 2, 3, 4, 5]) { buffer.addStep({ tick, timings }, tick); }
    const data = buffer.data();
    expect(Array.from(data.steps.tick)).toEqual([3, 4, 5]);
    expect(Array.from(data.steps.stepMs)).toEqual([2.5, 2.5, 2.5]);
    expect(data.systems.map(({ system, values }) => [system, Array.from(values)])).toEqual([["scripts", [1.5, 1.5, 1.5]], ["physics", [0.5, 0.5, 0.5]]]);
    expect(Array.from(data.steps.bodies).every(Number.isNaN)).toBe(true);
    expect(data.startedAt).toBe(1);
    expect(data.endedAt).toBe(5);
  });

  it("stops accepting rows when it does not overwrite and is full", () => {
    const buffer = new GameProfileBuffer(2, 2, false);
    expect(buffer.addStep({ tick: 1 }, 0)).toBe(true);
    expect(buffer.addStep({ tick: 2 }, 0)).toBe(true);
    expect(buffer.full).toBe(true);
    expect(buffer.addStep({ tick: 3 }, 0)).toBe(false);
    expect(Array.from(buffer.data().steps.tick)).toEqual([1, 2]);
  });

  it("keeps a full capture under its byte limit with any number of scripted entities", () => {
    expect(GameProfileBuffer.maxBytes(GAME_PROFILER_CAPTURE_TICKS, GAME_PROFILER_CAPTURE_FRAMES)).toBeLessThanOrEqual(GAME_PROFILER_CAPTURE_BYTE_LIMIT);
    const buffer = new GameProfileBuffer(GAME_PROFILER_CAPTURE_TICKS, GAME_PROFILER_CAPTURE_FRAMES, false);
    const entities = GAME_PROFILER_MAX_SCRIPT_ENTITIES + 500;
    const wide = scriptStep(0, entities);
    buffer.addStep(wide, 0);
    const before = buffer.bytes();
    for (let tick = 1; tick < GAME_PROFILER_CAPTURE_TICKS; tick++) { buffer.addStep({ ...wide, tick }, tick); }
    expect(buffer.full).toBe(true);
    // Memory is fixed by the capacities: recording more ticks for the same entities adds nothing.
    expect(buffer.bytes()).toBe(before);
    expect(buffer.bytes()).toBeLessThanOrEqual(GAME_PROFILER_CAPTURE_BYTE_LIMIT);
    const scripts = buffer.data().scripts;
    expect(scripts).toHaveLength(GAME_PROFILER_MAX_SCRIPT_ENTITIES + 1);
    expect(scripts.at(-1)).toMatchObject({ entityId: GAME_PROFILER_OTHER_ENTITIES, calls: 500 * GAME_PROFILER_CAPTURE_TICKS });
  });

  it("rejects capacities that are not positive integers", () => {
    expect(() => new GameProfileBuffer(0, 1, true)).toThrow("positive integers");
    expect(() => new GameProfileBuffer(1, 1.5, true)).toThrow("positive integers");
  });
});

describe("createGameProfiler", () => {
  it("records nothing until a view attaches", () => {
    const profiler = createGameProfiler();
    profiler.recordRender({ drawCalls: 4, textureBytes: 64 }, 0);
    profiler.recordStep({ tick: 1, timings });
    expect(profiler.recording()).toBe(false);
    expect(profiler.live().steps.tick).toHaveLength(0);
    expect(profiler.version()).toBe(0);
    const detach = profiler.attach();
    profiler.recordStep({ tick: 2, timings });
    expect(profiler.live().steps.tick).toHaveLength(1);
    detach();
    detach();
    expect(profiler.recording()).toBe(false);
  });

  it("records one frame time per rendered frame, apart from the steps", () => {
    const profiler = createGameProfiler();
    profiler.attach();
    profiler.recordRender({ drawCalls: 3, textureBytes: 1024, triangles: 12, geometryBytes: 2048 }, 1000);
    // Two catch-up steps after one frame record no frame time of their own.
    profiler.recordStep({ tick: 1, timings, physics: { bodies: 5, contacts: 2 }, voices: 1 });
    profiler.recordStep({ tick: 2, timings });
    profiler.recordRender({ drawCalls: 4, textureBytes: 1024 }, 1016);
    // A frame with no step in between is still a frame.
    profiler.recordRender({ drawCalls: 4, textureBytes: 1024 }, 1024);
    // Active playback retains long stalls as completed frame intervals.
    profiler.recordRender({ drawCalls: 4, textureBytes: 1024 }, 5000);
    const data = profiler.live();
    expect(Array.from(data.frames.frameMs)).toEqual([Number.NaN, 16, 8, 3976]);
    expect(Array.from(data.frames.drawCalls)).toEqual([3, 4, 4, 4]);
    expect(Array.from(data.steps.tick)).toEqual([1, 2]);
    expect(Array.from(data.steps.bodies)).toEqual([5, Number.NaN]);
  });

  it("keeps a bounded live window, a separate capture and stops a full capture by itself", () => {
    const profiler = createGameProfiler(2, 3, 10);
    profiler.attach();
    profiler.recordStep({ tick: 1 });
    profiler.startCapture(10_000);
    expect(profiler.capturing()).toBe(true);
    for (const tick of [2, 3, 4]) { profiler.recordStep({ tick }); }
    expect(Array.from(profiler.live().steps.tick)).toEqual([3, 4]);
    expect(profiler.capturing()).toBe(true);
    profiler.recordStep({ tick: 5 }, 12_500);
    expect(profiler.capturing()).toBe(false);
    const capture = profiler.capture();
    expect(capture).toMatchObject({ startedAt: 10_000, endedAt: 12_500, full: true });
    expect(Array.from(capture?.data.steps.tick ?? [])).toEqual([2, 3, 4]);
    expect(profiler.stopCapture()).toBe(capture);
    profiler.clearLive();
    expect(profiler.live().steps.tick).toHaveLength(0);
    expect(profiler.capture()).toBe(capture);
    profiler.clear();
    expect(profiler.capture()).toBeNull();
  });

  it("keeps recording while a capture runs with no view attached", () => {
    const profiler = createGameProfiler();
    profiler.startCapture(0);
    profiler.recordStep({ tick: 1 });
    expect(Array.from(profiler.stopCapture(100)?.data.steps.tick ?? [])).toEqual([1]);
    expect(profiler.recording()).toBe(false);
  });
});

it("retains a long completion interval during uninterrupted active playback", () => {
  const profiler = createGameProfiler();
  profiler.attach();
  profiler.recordRender({ drawCalls: 1, textureBytes: 0 }, 1000);
  profiler.recordRender({ drawCalls: 2, textureBytes: 0 }, 2501);
  expect(Array.from(profiler.live().frames.frameMs)).toEqual([Number.NaN, 1501]);
});


it("excludes explicit pauses while retaining paused render statistics and resumed frame intervals", () => {
  const profiler = createGameProfiler();
  profiler.attach();
  profiler.recordRender({ drawCalls: 1, textureBytes: 0 }, 1000);
  profiler.setPlaybackActive(false);
  profiler.recordRender({ drawCalls: 2, textureBytes: 0 }, 5000);
  profiler.recordRender({ drawCalls: 3, textureBytes: 0 }, 9000);
  profiler.setPlaybackActive(true);
  profiler.recordRender({ drawCalls: 4, textureBytes: 0 }, 12000);
  profiler.recordRender({ drawCalls: 5, textureBytes: 0 }, 12016);
  expect(Array.from(profiler.live().frames.frameMs)).toEqual([Number.NaN, Number.NaN, Number.NaN, Number.NaN, 16]);
  expect(Array.from(profiler.live().frames.drawCalls)).toEqual([1, 2, 3, 4, 5]);
});

it("starts a fresh interval after recording detaches without a completion during the gap", () => {
  const profiler = createGameProfiler();
  const detach = profiler.attach();
  profiler.recordRender({ drawCalls: 1, textureBytes: 0 }, 1000);
  detach();
  profiler.attach();
  profiler.recordRender({ drawCalls: 2, textureBytes: 0 }, 5000);
  profiler.recordRender({ drawCalls: 3, textureBytes: 0 }, 5016);
  expect(Array.from(profiler.live().frames.frameMs)).toEqual([Number.NaN, Number.NaN, 16]);
});


it("starts a new frame interval after a capture stops and restarts without an attached view", () => {
  const profiler = createGameProfiler();
  profiler.startCapture(0);
  profiler.recordRender({ drawCalls: 1, textureBytes: 0 }, 1000);
  profiler.recordRender({ drawCalls: 2, textureBytes: 0 }, 1016);
  profiler.stopCapture(2000);
  profiler.startCapture(3000);
  profiler.recordRender({ drawCalls: 3, textureBytes: 0 }, 5000);
  profiler.recordRender({ drawCalls: 4, textureBytes: 0 }, 5016);
  expect(Array.from(profiler.stopCapture(6000)!.data.frames.frameMs)).toEqual([Number.NaN, 16]);
});
