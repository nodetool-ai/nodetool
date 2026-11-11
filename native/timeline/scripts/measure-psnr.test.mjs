import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { measurePsnr } from "./measure-psnr.mjs";

test("PSNR accepts literal paths and preserves FFmpeg errors", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nt-psnr-"));
  try {
    const pictures = ["red", "blue"].map(color => {
      const file = path.join(dir, `${color} '$literal'.png`);
      const result = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i",
        `color=c=${color}:size=16x16`, "-frames:v", "1", file], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      return file;
    });
    assert.equal(measurePsnr(pictures[0], pictures[0]), Infinity);
    const different = measurePsnr(...pictures);
    assert.ok(Number.isFinite(different) && different < 40);
    assert.throws(() => measurePsnr(pictures[0], path.join(dir, "missing.png")), /FFmpeg PSNR failed/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
