import { expect, it } from "vitest";
import { gameBuildFingerprint } from "../src/build-fingerprint.js";

it("identifies changed runtime bytes, filenames and format while ignoring map insertion order", () => {
  const original = { format: "v1", "player.js": new Uint8Array([1, 2]), "runtime.wasm": new Uint8Array([3, 4]) };
  const fingerprint = gameBuildFingerprint(original);
  expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(gameBuildFingerprint({ "runtime.wasm": original["runtime.wasm"], "player.js": original["player.js"], format: "v1" })).toBe(fingerprint);
  expect(gameBuildFingerprint({ ...original, "player.js": new Uint8Array([2, 1]) })).not.toBe(fingerprint);
  expect(gameBuildFingerprint({ ...original, "runtime.wasm": new Uint8Array([4, 3]) })).not.toBe(fingerprint);
  expect(gameBuildFingerprint({ ...original, format: "v2" })).not.toBe(fingerprint);
  expect(gameBuildFingerprint({ format: "v1", "renamed.js": original["player.js"], "runtime.wasm": original["runtime.wasm"] })).not.toBe(fingerprint);
});
