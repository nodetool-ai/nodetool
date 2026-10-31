/**
 * The native key resolver against the web's `resolveTimelineAction`, for
 * every preset, every key below with and without a physical code, and every
 * modifier combination.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import {
  resolveTimelineAction,
  TIMELINE_KEYBOARD_PRESETS
} from "../../../../web/src/components/timeline/timelineKeymap.ts";

const KEYS = [
  ..."abcdefghijklmnopqrstuvwxyz".split(""),
  ..."ABCZ".split(""),
  ..."0123456789".split(""),
  ..."?,.'[];\\=-`/+_<>|".split(""),
  "Delete", "Backspace", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End",
  "Escape", " ", "Enter", "Tab", "PageUp", "PageDown", "Dead", "†", "µ"
];
const CODES: Record<string, string> = { ",": "Comma", ".": "Period", "'": "Quote", "[": "BracketLeft", "]": "BracketRight", ";": "Semicolon", "\\": "Backslash", "=": "Equal", "-": "Minus", "`": "Backquote", "Dead": "Backquote", "†": "KeyT", "µ": "KeyM", "<": "Comma", ">": "Period" };

function codeFor(key: string): string | undefined {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  return CODES[key];
}

describe("native keymap", () => {
  for (const preset of TIMELINE_KEYBOARD_PRESETS) {
    it(`${preset}: resolves like the web`, () => {
      const events = [];
      for (const key of KEYS) {
        for (let m = 0; m < 16; m++) {
          for (const withCode of [false, true]) {
            const code = withCode ? codeFor(key) : undefined;
            if (withCode && code === undefined) continue;
            events.push({
              key,
              code,
              ctrlKey: (m & 1) !== 0,
              metaKey: (m & 2) !== 0,
              shiftKey: (m & 4) !== 0,
              altKey: (m & 8) !== 0
            });
          }
        }
      }
      if (process.env.NT_OPS_COUNT_FILE) appendFileSync(process.env.NT_OPS_COUNT_FILE, "1\n");
      const out = JSON.parse(
        execFileSync(process.env.NT_TIMELINE_OPS!, [], {
          input: JSON.stringify({ fn: "resolveTimelineActions", args: [events, preset] }),
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024
        })
      ).result;
      const expected = events.map((e) => resolveTimelineAction(e, preset));
      const mismatches = events
        .map((e, i) => ({ e, web: expected[i], native: out[i] }))
        .filter((x) => x.web !== x.native);
      expect(mismatches).toEqual([]);
      const bound = expected.filter((a) => a !== null).length;
      console.log(`${preset}: ${events.length} events, ${bound} bound`);
      expect(bound).toBeGreaterThan(50);
    });
  }
});
