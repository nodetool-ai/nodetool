import { describe, expect, it } from "vitest";
import { gameEntity, gameEvent } from "../src/game.js";
import { gameEntity3D } from "../src/game3d.js";

const base = { assetId: "sfx.hum", onEvent: "hum" };

describe("spatial audio source schema", () => {
  it("leaves a plain audio source unchanged when parsed", () => {
    expect(gameEntity.parse({ id: "radio", transform2d: { x: 0, y: 0 }, audioSource: base }).audioSource).toEqual({ ...base, volume: 1 });
  });

  it("accepts spatial settings on 2D and 3D entities", () => {
    const audioSource = { ...base, spatial: true, minDistance: 2, maxDistance: 40, rolloff: 0.5, distanceModel: "linear",
      cone: { innerAngle: 60, outerAngle: 180, outerGain: 0.2 }, doppler: 1 };
    expect(gameEntity.parse({ id: "radio", transform2d: { x: 0, y: 0 }, audioSource }).audioSource).toEqual({ ...audioSource, volume: 1 });
    expect(gameEntity3D.parse({ id: "radio", transform3d: {}, audioSource }).audioSource).toEqual({ ...audioSource, volume: 1 });
  });

  it("rejects out-of-range spatial settings", () => {
    for (const field of [{ minDistance: 0 }, { maxDistance: -1 }, { rolloff: 17 }, { distanceModel: "cubic" }, { doppler: 5 },
      { cone: { innerAngle: 400, outerAngle: 360, outerGain: 0 } }, { cone: { innerAngle: 10, outerAngle: 20, outerGain: 2 } }]) {
      expect(gameEntity.safeParse({ id: "radio", transform2d: { x: 0, y: 0 }, audioSource: { ...base, ...field } }).success, JSON.stringify(field)).toBe(false);
    }
  });

  it("carries a resolved emitter on audio events", () => {
    const emitter = { entityId: "radio", position: { x: 5, y: 0, z: 0 }, minDistance: 1, maxDistance: 50, rolloff: 1,
      distanceModel: "inverse", doppler: 0 };
    expect(gameEvent.parse({ kind: "audio", assetId: "sfx.hum", emitter })).toMatchObject({ emitter });
    expect(gameEvent.safeParse({ kind: "audio", assetId: "sfx.hum", emitter: { ...emitter, position: { x: 5 } } }).success).toBe(false);
  });
});
