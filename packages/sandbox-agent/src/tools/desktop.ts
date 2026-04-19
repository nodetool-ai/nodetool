/**
 * Desktop (X11) tools — thin wrappers over xdotool and scrot.
 *
 * Coordinates are screen pixels against $DISPLAY (":99" by default, set by
 * entrypoint.sh). Screenshots are returned as base64-encoded image data.
 * `screen_find` uses tesseract OCR to locate text on screen; template image
 * matching is deferred to a later phase.
 *
 * These tools intentionally have NO in-memory state — every call is a
 * fresh subprocess.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type {
  ScreenCaptureInput,
  ScreenCaptureOutput,
  ScreenFindInput,
  ScreenFindOutput,
  ScreenMatch,
  MouseMoveInput,
  MouseMoveOutput,
  MouseClickInput,
  MouseClickOutput,
  MouseDragInput,
  MouseDragOutput,
  MouseScrollInput,
  MouseScrollOutput,
  KeyPressInput,
  KeyPressOutput,
  KeyTypeInput,
  KeyTypeOutput,
  CursorPositionOutput
} from "@nodetool/sandbox/schemas";

const XDOTOOL_BUTTON: Record<string, string> = {
  left: "1",
  middle: "2",
  right: "3"
};

export async function screenCapture(
  input: ScreenCaptureInput
): Promise<ScreenCaptureOutput> {
  const format = input.format ?? "png";
  const ext = format === "jpeg" ? "jpg" : "png";
  const tmpFile = join(
    tmpdir(),
    `nt-capture-${randomBytes(6).toString("hex")}.${ext}`
  );

  const args: string[] = ["-o"];
  if (input.region) {
    args.push("-a", `${input.region.x},${input.region.y},${input.region.width},${input.region.height}`);
  }
  if (format === "jpeg") {
    args.push("-q", "90");
  }
  args.push(tmpFile);

  try {
    await runCapture("scrot", args);
    const buf = await fs.readFile(tmpFile);
    const b64 = buf.toString("base64");
    const { width, height } = input.region
      ? {
          width: input.region.width,
          height: input.region.height
        }
      : await readPngDimensions(buf);
    return { image_b64: b64, format, width, height };
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

export async function screenFind(
  input: ScreenFindInput
): Promise<ScreenFindOutput> {
  // Capture screen (or region), run tesseract with TSV output, filter by query.
  const tmpImg = join(
    tmpdir(),
    `nt-find-${randomBytes(6).toString("hex")}.png`
  );
  const scrotArgs: string[] = ["-o"];
  let regionOffset = { x: 0, y: 0 };
  if (input.region) {
    scrotArgs.push(
      "-a",
      `${input.region.x},${input.region.y},${input.region.width},${input.region.height}`
    );
    regionOffset = { x: input.region.x, y: input.region.y };
  }
  scrotArgs.push(tmpImg);

  try {
    await runCapture("scrot", scrotArgs);
    const tsv = (
      await runCapture("tesseract", [tmpImg, "stdout", "tsv"])
    ).toString("utf-8");
    const matches = parseTesseractTsv(tsv, input.query, regionOffset);
    return { matches };
  } finally {
    await fs.unlink(tmpImg).catch(() => {});
  }
}

export async function mouseMove(input: MouseMoveInput): Promise<MouseMoveOutput> {
  if (input.duration_ms && input.duration_ms > 0) {
    // xdotool has no native tween, so step in ~10ms increments.
    const steps = Math.max(2, Math.round(input.duration_ms / 10));
    const cur = await getCursor();
    for (let i = 1; i <= steps; i++) {
      const x = Math.round(cur.x + ((input.x - cur.x) * i) / steps);
      const y = Math.round(cur.y + ((input.y - cur.y) * i) / steps);
      await runCapture("xdotool", ["mousemove", String(x), String(y)]);
      await sleep(Math.round(input.duration_ms / steps));
    }
  } else {
    await runCapture("xdotool", [
      "mousemove",
      String(input.x),
      String(input.y)
    ]);
  }
  return { moved: true };
}

export async function mouseClick(
  input: MouseClickInput
): Promise<MouseClickOutput> {
  const button = XDOTOOL_BUTTON[input.button ?? "left"] ?? "1";
  const count = input.count ?? 1;
  await runCapture("xdotool", [
    "mousemove",
    String(input.x),
    String(input.y),
    "click",
    "--repeat",
    String(count),
    button
  ]);
  return { clicked: true };
}

export async function mouseDrag(input: MouseDragInput): Promise<MouseDragOutput> {
  const button = XDOTOOL_BUTTON[input.button ?? "left"] ?? "1";
  await runCapture("xdotool", [
    "mousemove",
    String(input.from_x),
    String(input.from_y),
    "mousedown",
    button
  ]);
  if (input.duration_ms && input.duration_ms > 0) {
    const steps = Math.max(2, Math.round(input.duration_ms / 10));
    for (let i = 1; i <= steps; i++) {
      const x = Math.round(input.from_x + ((input.to_x - input.from_x) * i) / steps);
      const y = Math.round(input.from_y + ((input.to_y - input.from_y) * i) / steps);
      await runCapture("xdotool", ["mousemove", String(x), String(y)]);
      await sleep(Math.round(input.duration_ms / steps));
    }
  } else {
    await runCapture("xdotool", [
      "mousemove",
      String(input.to_x),
      String(input.to_y)
    ]);
  }
  await runCapture("xdotool", ["mouseup", button]);
  return { dragged: true };
}

export async function mouseScroll(
  input: MouseScrollInput
): Promise<MouseScrollOutput> {
  // xdotool: button 4 scroll up, 5 down, 6 left, 7 right; each click = 1 step.
  await runCapture("xdotool", [
    "mousemove",
    String(input.x),
    String(input.y)
  ]);
  const steps = Math.min(50, Math.abs(input.dy));
  const vButton = input.dy < 0 ? "4" : "5";
  if (steps > 0) {
    await runCapture("xdotool", [
      "click",
      "--repeat",
      String(steps),
      vButton
    ]);
  }
  if (input.dx !== undefined && input.dx !== 0) {
    const hSteps = Math.min(50, Math.abs(input.dx));
    const hButton = input.dx < 0 ? "6" : "7";
    await runCapture("xdotool", [
      "click",
      "--repeat",
      String(hSteps),
      hButton
    ]);
  }
  return { scrolled: true };
}

export async function keyPress(input: KeyPressInput): Promise<KeyPressOutput> {
  await runCapture("xdotool", ["key", "--", input.keys]);
  return { pressed: true };
}

export async function keyType(input: KeyTypeInput): Promise<KeyTypeOutput> {
  const args = ["type"];
  if (input.delay_ms !== undefined) {
    args.push("--delay", String(input.delay_ms));
  }
  args.push("--", input.text);
  await runCapture("xdotool", args);
  return { typed: true };
}

export async function cursorPosition(): Promise<CursorPositionOutput> {
  return getCursor();
}

// ---- internals -------------------------------------------------------------

async function getCursor(): Promise<{ x: number; y: number }> {
  const out = (await runCapture("xdotool", ["getmouselocation"]))
    .toString("utf-8")
    .trim();
  // Format: "x:NNN y:NNN screen:0 window:0"
  const match = /x:(-?\d+)\s+y:(-?\d+)/.exec(out);
  if (!match) throw new Error(`unable to parse cursor position: ${out}`);
  return { x: parseInt(match[1], 10), y: parseInt(match[2], 10) };
}

async function readPngDimensions(
  buf: Buffer
): Promise<{ width: number; height: number }> {
  // PNG signature is 8 bytes, then an IHDR chunk at offset 8:
  //   4B length, 4B "IHDR", 4B width, 4B height, ...
  if (
    buf.length < 24 ||
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47
  ) {
    return { width: 0, height: 0 };
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20)
  };
}

/** @internal exported for tests */
export function parseTesseractTsv(
  tsv: string,
  query: string,
  offset: { x: number; y: number }
): ScreenMatch[] {
  const lines = tsv.split("\n");
  if (lines.length < 2) return [];
  const header = lines[0].split("\t");
  const col = (name: string) => header.indexOf(name);
  const idx = {
    left: col("left"),
    top: col("top"),
    width: col("width"),
    height: col("height"),
    conf: col("conf"),
    text: col("text")
  };
  if (Object.values(idx).some((v) => v < 0)) return [];

  const needle = query.toLowerCase();
  const matches: ScreenMatch[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split("\t");
    if (parts.length <= idx.text) continue;
    const text = parts[idx.text];
    if (!text || !text.toLowerCase().includes(needle)) continue;
    const rawConf = parseFloat(parts[idx.conf]);
    const confidence = Number.isFinite(rawConf) ? Math.max(0, rawConf) / 100 : 0;
    const left = parseInt(parts[idx.left], 10);
    const top = parseInt(parts[idx.top], 10);
    const width = parseInt(parts[idx.width], 10);
    const height = parseInt(parts[idx.height], 10);
    if ([left, top, width, height].some((n) => !Number.isFinite(n))) continue;
    matches.push({
      text,
      confidence,
      x: offset.x + left,
      y: offset.y + top,
      width,
      height
    });
  }
  return matches;
}

function runCapture(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child: ChildProcess = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ":99" }
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on("data", (c: Buffer) => out.push(c));
    child.stderr?.on("data", (c: Buffer) => err.push(c));
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      if (code === 0) resolve(Buffer.concat(out));
      else
        reject(
          new Error(
            Buffer.concat(err).toString("utf-8").trim() || `${cmd} exit ${code}`
          )
        );
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
