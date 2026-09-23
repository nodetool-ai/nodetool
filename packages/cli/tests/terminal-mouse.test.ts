import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { MouseInput, type MouseEvent } from "../src/terminal-mouse.js";

describe("terminal mouse input", () => {
  it("keeps split mouse reports out of keyboard input", () => {
    const source = new PassThrough();
    const input = new MouseInput(source as unknown as NodeJS.ReadStream);
    const keys: string[] = [];
    const events: MouseEvent[] = [];
    input.on("data", (chunk: Buffer) => keys.push(chunk.toString()));
    input.events.on("mouse", (event: MouseEvent) => events.push(event));
    source.write("hi\u001b[<64;8;");
    source.write("6M\u001b[<0;4;5M\u001b[<32;6;5M\u001b[<0;6;5m!");
    expect(keys.join("")).toBe("hi!");
    expect(events).toEqual([
      { action: "wheel", x: 8, y: 6, direction: -1 },
      { action: "down", x: 4, y: 5 },
      { action: "move", x: 6, y: 5 },
      { action: "up", x: 6, y: 5 }
    ]);
    input.close();
  });
});
