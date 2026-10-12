import { createGameProfiler, GAME_PROFILER_CAPTURE_TICKS, GameProfileBuffer, type GameProfileCapture } from "../gameProfiler";
import {
  downloadGameProfile, formatGameProfileBytes, GAME_PROFILE_FORMAT, gameProfileExport, gameProfileFileName, gameProfileStat, summarizeGameProfile
} from "../gameProfileModel";

const source = { gameId: "game-1", name: "Cave Run: Part 2", dimension: "3d", tickRate: 60 } as const;

function smallCapture(): GameProfileCapture {
  const buffer = new GameProfileBuffer(8, 8, false);
  buffer.addFrame(undefined, { drawCalls: 10, textureBytes: 1024 });
  buffer.addFrame(16, { drawCalls: 12, textureBytes: 1024 });
  buffer.addFrame(20, { drawCalls: 12, textureBytes: 1024 });
  buffer.addStep({ tick: 10, timings: { systems: [{ system: "scripts", durationMs: 1 }, { system: "physics", durationMs: 1 }], totalMs: 2 },
    scriptStats: { durationMs: 1, calls: 2, commands: 2, byEntity: { player: { durationMs: 0.75, calls: 1 }, door: { durationMs: 0.25, calls: 1 } } },
    physics: { bodies: 3, contacts: 1 } }, 0);
  buffer.addStep({ tick: 11, timings: { systems: [{ system: "scripts", durationMs: 3 }, { system: "physics", durationMs: 1 }], totalMs: 4 },
    scriptStats: { durationMs: 3, calls: 2, commands: 2, byEntity: { player: { durationMs: 3, calls: 2 } } }, physics: { bodies: 4, contacts: 0 } }, 0);
  buffer.addStep({ tick: 12 }, 0);
  return { startedAt: Date.UTC(2026, 9, 12, 8, 30), endedAt: Date.UTC(2026, 9, 12, 8, 31), data: buffer.data(), full: false };
}

it("computes statistics over the values that are present", () => {
  expect(gameProfileStat(new Float32Array([Number.NaN]))).toBeNull();
  expect(gameProfileStat(new Float32Array([4, 1, Number.NaN, 3, 2]))).toEqual({ avg: 2.5, p95: 4, max: 4, last: 2, count: 4 });
  expect(gameProfileStat(new Float32Array([4, 1]), false)).toEqual({ avg: 2.5, max: 4, last: 1, count: 2 });
});

it("summarizes systems in pipeline order and entities by script time", () => {
  const summary = summarizeGameProfile(smallCapture().data);
  expect(summary).toMatchObject({ ticks: 3, frames: 3, firstTick: 10, lastTick: 12 });
  expect(summary.metrics.frameMs).toMatchObject({ avg: 18, max: 20, last: 20, count: 2 });
  expect(summary.metrics.triangles).toBeNull();
  expect(summary.metrics.contacts).toMatchObject({ max: 1, last: 0 });
  expect(summary.metrics.contacts).not.toHaveProperty("p95");
  expect(summary.systems).toEqual([{ system: "scripts", avgMs: 2, maxMs: 3 }, { system: "physics", avgMs: 1, maxMs: 1 }]);
  expect(summary.scripts).toEqual([
    { entityId: "player", avgMs: 1.875, maxMs: 3, calls: 3 },
    { entityId: "door", avgMs: 0.125, maxMs: 0.25, calls: 1 }
  ]);
});

it("exports a capture as columns with per-entity totals", () => {
  const capture = smallCapture();
  const profile = gameProfileExport(source, { kind: "capture", capture });
  expect(profile).toMatchObject({ format: GAME_PROFILE_FORMAT, version: 1, game: source, source: "capture", startedAt: "2026-10-12T08:30:00.000Z",
    endedAt: "2026-10-12T08:31:00.000Z", full: false });
  expect(profile.steps.tick).toEqual([10, 11, 12]);
  expect(profile.steps.bodies).toEqual([3, 4, null]);
  expect(profile.systems).toEqual({ scripts: [1, 3, null], physics: [1, 1, null] });
  expect(profile.frames.frameMs).toEqual([null, 16, 20]);
  expect(profile.scripts).toEqual([{ entityId: "player", totalMs: 3.75, maxMs: 3, calls: 3 }, { entityId: "door", totalMs: 0.25, maxMs: 0.25, calls: 1 }]);
  expect(profile.summary).toEqual(summarizeGameProfile(capture.data));
  expect(JSON.parse(JSON.stringify(profile))).toEqual(profile);
  expect(gameProfileFileName(profile)).toBe("Cave-Run-Part-2-profile-2026-10-12T08-30-00-000Z.json");
  expect(gameProfileFileName({ ...profile, game: { ...source, name: "  " } })).toMatch(/^game-profile-/);
});

it("exports the live window when there is no capture", () => {
  const profiler = createGameProfiler();
  profiler.attach();
  for (let tick = 1; tick <= 700; tick++) { profiler.recordStep({ tick }, Date.UTC(2026, 9, 12, 9) + tick * 16); }
  const profile = gameProfileExport(source, { kind: "live", data: profiler.live() });
  expect(profile.source).toBe("live");
  expect(profile.steps.tick).toHaveLength(600);
  expect(profile.steps.tick[0]).toBe(101);
  expect(profile.startedAt).toBe(new Date(Date.UTC(2026, 9, 12, 9) + 16).toISOString());
  expect(gameProfileFileName(profile)).toMatch(/^Cave-Run-Part-2-live-profile-/);
});

it("exports a full capture of 128 scripted entities as compact JSON", () => {
  const profiler = createGameProfiler();
  profiler.startCapture(0);
  const timings = { systems: ["input", "scripts", "physics", "contacts", "gameplay", "animation", "presentation"].map((system) => ({ system, durationMs: 0.25 })), totalMs: 2 };
  const byEntity: Record<string, { durationMs: number; calls: number }> = {};
  for (let entity = 0; entity < 128; entity++) { byEntity[`entity-${entity.toString().padStart(30, "0")}`] = { durationMs: 0.01, calls: 1 }; }
  for (let tick = 0; tick < GAME_PROFILER_CAPTURE_TICKS; tick++) {
    profiler.recordRender({ drawCalls: 40, textureBytes: 1e7, triangles: 5000, geometryBytes: 1e6 }, tick * 16);
    profiler.recordStep({ tick, timings, scriptStats: { durationMs: 1.28, calls: 128, commands: 128, byEntity }, physics: { bodies: 30, contacts: 3 }, voices: 2 }, tick);
  }
  const capture = profiler.stopCapture(1);
  if (!capture) { throw new Error("Capture missing"); }
  const json = JSON.stringify(gameProfileExport(source, { kind: "capture", capture }));
  expect(json.startsWith("{\"format\"")).toBe(true);
  expect(json).not.toContain("\n");
  // Per-tick columns, not a per-tick entity map: 36,000 ticks of 128 entities stays a few megabytes.
  expect(json.length).toBeLessThan(16 * 1024 * 1024);
  const parsed = JSON.parse(json) as { scripts: unknown[]; steps: { tick: unknown[] } };
  expect(parsed.scripts).toHaveLength(128);
  expect(parsed.steps.tick).toHaveLength(GAME_PROFILER_CAPTURE_TICKS);
});

it("downloads the profile as a JSON file", async () => {
  jest.useFakeTimers();
  const blobs: Blob[] = [];
  const createObjectURL = jest.fn((blob: Blob) => { blobs.push(blob); return "blob:profile"; });
  const revokeObjectURL = jest.fn();
  const original = { createObjectURL: URL.createObjectURL, revokeObjectURL: URL.revokeObjectURL };
  Object.assign(URL, { createObjectURL, revokeObjectURL });
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.href).toBe("blob:profile");
    expect(this.download).toBe("Cave-Run-Part-2-profile-2026-10-12T08-30-00-000Z.json");
  });
  try {
    const profile = gameProfileExport(source, { kind: "capture", capture: smallCapture() });
    downloadGameProfile(profile);
    expect(click).toHaveBeenCalledTimes(1);
    expect(blobs[0].type).toBe("application/json");
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blobs[0]);
    });
    expect(text).toBe(JSON.stringify(profile));
    expect(revokeObjectURL).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:profile");
  } finally {
    click.mockRestore();
    Object.assign(URL, original);
    jest.useRealTimers();
  }
});

it("formats byte counts with binary units", () => {
  expect(formatGameProfileBytes(512)).toBe("512 B");
  expect(formatGameProfileBytes(1536)).toBe("1.5 KB");
  expect(formatGameProfileBytes(3 * 1024 * 1024)).toBe("3.0 MB");
});
