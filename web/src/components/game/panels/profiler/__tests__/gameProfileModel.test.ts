import type { GameProfileSample } from "../gameProfiler";
import {
  downloadGameProfile, formatGameProfileBytes, GAME_PROFILE_FORMAT, gameProfileExport, gameProfileFileName, gameProfileStat, summarizeGameProfile
} from "../gameProfileModel";

const samples: GameProfileSample[] = [
  { tick: 10, frameMs: 16, stepMs: 2, systems: [{ system: "scripts", durationMs: 1 }, { system: "physics", durationMs: 1 }],
    scriptMs: 1, scriptsByEntity: { player: { durationMs: 0.75, calls: 1 }, door: { durationMs: 0.25, calls: 1 } }, drawCalls: 10, bodies: 3, contacts: 1 },
  { tick: 11, frameMs: 20, stepMs: 4, systems: [{ system: "scripts", durationMs: 3 }, { system: "physics", durationMs: 1 }],
    scriptMs: 3, scriptsByEntity: { player: { durationMs: 3, calls: 2 } }, drawCalls: 12, bodies: 4, contacts: 0 },
  { tick: 12 }
];

const source = { gameId: "game-1", name: "Cave Run: Part 2", dimension: "3d", tickRate: 60 } as const;

it("computes statistics over the samples that reported a value", () => {
  expect(gameProfileStat([])).toBeNull();
  expect(gameProfileStat([4, 1, 3, 2])).toEqual({ avg: 2.5, p95: 4, max: 4, last: 2, count: 4 });
});

it("summarizes systems in pipeline order and entities by script time", () => {
  const summary = summarizeGameProfile(samples);
  expect(summary.samples).toBe(3);
  expect(summary.firstTick).toBe(10);
  expect(summary.lastTick).toBe(12);
  expect(summary.metrics.frameMs).toMatchObject({ avg: 18, max: 20, last: 20, count: 2 });
  expect(summary.metrics.triangles).toBeNull();
  expect(summary.metrics.contacts).toMatchObject({ max: 1, last: 0 });
  expect(summary.systems).toEqual([{ system: "scripts", avgMs: 2, maxMs: 3 }, { system: "physics", avgMs: 1, maxMs: 1 }]);
  expect(summary.scripts).toEqual([
    { entityId: "player", avgMs: 1.875, maxMs: 3, calls: 3 },
    { entityId: "door", avgMs: 0.125, maxMs: 0.25, calls: 1 }
  ]);
});

it("exports a capture as a versioned JSON profile with its summary and samples", () => {
  const profile = gameProfileExport(source, { startedAt: Date.UTC(2026, 9, 12, 8, 30), endedAt: Date.UTC(2026, 9, 12, 8, 31), samples, truncated: false });
  expect(profile).toMatchObject({ format: GAME_PROFILE_FORMAT, version: 1, game: source, startedAt: "2026-10-12T08:30:00.000Z",
    endedAt: "2026-10-12T08:31:00.000Z", truncated: false, samples });
  expect(profile.summary).toEqual(summarizeGameProfile(samples));
  expect(JSON.parse(JSON.stringify(profile))).toEqual(profile);
  expect(gameProfileFileName(profile)).toBe("Cave-Run-Part-2-profile-2026-10-12T08-30-00-000Z.json");
  expect(gameProfileFileName({ ...profile, game: { ...source, name: "  " } })).toMatch(/^game-profile-/);
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
    const profile = gameProfileExport(source, { startedAt: Date.UTC(2026, 9, 12, 8, 30), endedAt: Date.UTC(2026, 9, 12, 8, 31), samples, truncated: false });
    downloadGameProfile(profile);
    expect(click).toHaveBeenCalledTimes(1);
    expect(blobs[0].type).toBe("application/json");
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blobs[0]);
    });
    expect(JSON.parse(text)).toEqual(profile);
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
