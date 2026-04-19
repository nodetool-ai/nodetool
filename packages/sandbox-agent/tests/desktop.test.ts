/**
 * Desktop tool tests.
 *
 * - parseTesseractTsv is pure and always tested.
 * - Runtime tests are gated on xdotool + scrot being installed AND a real
 *   X display being available (either a running Xvfb or host X11). In most
 *   CI environments the runtime tests are skipped.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { parseTesseractTsv } from "../src/tools/desktop.js";

const xdotoolAvailable =
  spawnSync("xdotool", ["--version"], { stdio: "ignore" }).status === 0;
const scrotAvailable =
  spawnSync("scrot", ["--version"], { stdio: "ignore" }).status === 0;
const displayAvailable = !!process.env.DISPLAY;

const runtimeOk = xdotoolAvailable && scrotAvailable && displayAvailable;
const describeRuntime = runtimeOk ? describe : describe.skip;

describe("parseTesseractTsv", () => {
  const header =
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";

  it("filters matches by query (case-insensitive) and returns offset coords", () => {
    const tsv =
      `${header}\n` +
      `5\t1\t1\t1\t1\t1\t10\t20\t30\t8\t95\tHello\n` +
      `5\t1\t1\t1\t1\t2\t50\t20\t40\t8\t90\tWorld\n`;
    const matches = parseTesseractTsv(tsv, "hello", { x: 100, y: 200 });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: "Hello",
      x: 110,
      y: 220,
      width: 30,
      height: 8
    });
    expect(matches[0].confidence).toBeCloseTo(0.95);
  });

  it("returns empty array for empty TSV", () => {
    expect(parseTesseractTsv("", "x", { x: 0, y: 0 })).toEqual([]);
  });

  it("returns empty array when no rows match", () => {
    const tsv = `${header}\n5\t1\t1\t1\t1\t1\t0\t0\t1\t1\t95\tonly\n`;
    expect(parseTesseractTsv(tsv, "missing", { x: 0, y: 0 })).toEqual([]);
  });

  it("normalizes negative tesseract confidence to 0", () => {
    const tsv =
      `${header}\n` + `5\t1\t1\t1\t1\t1\t0\t0\t5\t5\t-1\tBlurry\n`;
    const matches = parseTesseractTsv(tsv, "blurry", { x: 0, y: 0 });
    expect(matches[0].confidence).toBe(0);
  });
});

describeRuntime("xdotool/scrot runtime (requires DISPLAY + tools)", () => {
  it("smoke: cursorPosition returns plausible coords", async () => {
    const { cursorPosition } = await import("../src/tools/desktop.js");
    const pos = await cursorPosition();
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
  });
});
