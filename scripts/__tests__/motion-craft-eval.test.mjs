/**
 * `parseTimelineRunEvents` is the part of `scripts/motion-craft-eval.mjs`
 * that must never guess wrong: it picks which saved timeline the eval loop
 * scores. Running the eval script end to end costs a real model call and
 * ~30 minutes, so this exercises the parser directly against a small
 * fixture — a trimmed extract of a real recorded `agent run --json` event
 * stream (see `fixtures/motion-craft-eval-events.sample.jsonl`), plus
 * synthetic cases for the shapes the real run didn't happen to exercise.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  extractTimelineIdFromAnswer,
  parseTimelineRunEvents,
  runProcessSplitOutputs
} from "../motion-craft-eval.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "fixtures/motion-craft-eval-events.sample.jsonl");

describe("parseTimelineRunEvents — real recorded sample", () => {
  /**
   * The fixture is a trimmed extract of the run that produced timeline
   * `e8fbc60c73ba409a92ffdb326ea05fc5` (the local DB record used as the
   * agent-craft baseline). It keeps: two probe `create_timeline` calls that
   * are abandoned, one `create_timeline` + `set_timeline_document` pair for
   * a timeline the run also abandoned (`f336ed...`), then the
   * `create_timeline` + `set_timeline_document` pair for the timeline the
   * run kept, plus two more `set_timeline_document` snapshot saves against
   * that same id — the last of which is the real run's final save. None of
   * these calls carry their own `tool_call_id` (they are logged from inside
   * `execute_code` sandbox actions, and the fixture keeps none of the
   * enclosing `execute_code` tool-result lines), so every one resolves
   * through the optimistic default — matching this parser's behavior on the
   * real, unfiltered 1233-line stream, which independently picks the same
   * id.
   */
  it("prefers the last set_timeline_document over the abandoned probes", () => {
    const lines = readFileSync(fixturePath, "utf8").split("\n");
    const result = parseTimelineRunEvents(lines);
    expect(result.timelineId).toBe("e8fbc60c73ba409a92ffdb326ea05fc5");
    expect(result.toolCallCounts.create_timeline).toBe(4);
    expect(result.toolCallCounts.set_timeline_document).toBe(4);
    expect(result.toolCallCounts.edit_timeline).toBe(1);
  });

  it("skips non-JSON log lines instead of throwing", () => {
    const lines = readFileSync(fixturePath, "utf8").split("\n");
    expect(lines.some((l) => !l.trim().startsWith("{"))).toBe(true);
    expect(() => parseTimelineRunEvents(lines)).not.toThrow();
  });
});

describe("parseTimelineRunEvents — synthetic shapes", () => {
  it("returns no timeline and no errors for an empty run", () => {
    const result = parseTimelineRunEvents([]);
    expect(result).toEqual({
      timelineId: null,
      toolCallCounts: {},
      errors: [],
      eventCount: 0
    });
  });

  it("resolves a direct tool call by its own tool_call_id", () => {
    const lines = [
      JSON.stringify({
        type: "tool_call_update",
        name: "set_timeline_document",
        tool_call_id: "call_1",
        args: { timeline_id: "abc123" }
      }),
      JSON.stringify({
        type: "tool_result_update",
        tool_call_id: "call_1",
        name: "set_timeline_document",
        result: { ok: true }
      })
    ];
    expect(parseTimelineRunEvents(lines).timelineId).toBe("abc123");
  });

  it("falls back to the last set_timeline_document when the winner is unresolved", () => {
    const lines = [
      JSON.stringify({
        type: "tool_call_update",
        name: "set_timeline_document",
        args: { timeline_id: "first" }
      }),
      JSON.stringify({
        type: "tool_call_update",
        name: "set_timeline_document",
        args: { timeline_id: "second" }
      })
    ];
    expect(parseTimelineRunEvents(lines).timelineId).toBe("second");
  });

  it("prefers a successful save over a later failed one", () => {
    const lines = [
      JSON.stringify({
        type: "tool_call_update",
        name: "execute_code",
        tool_call_id: "exec_1"
      }),
      JSON.stringify({
        type: "tool_call_update",
        name: "set_timeline_document",
        args: { timeline_id: "good" }
      }),
      JSON.stringify({
        type: "tool_result_update",
        tool_call_id: "exec_1",
        name: "execute_code",
        result: { value: JSON.stringify({ ok: true }) }
      }),
      JSON.stringify({
        type: "tool_call_update",
        name: "execute_code",
        tool_call_id: "exec_2"
      }),
      JSON.stringify({
        type: "tool_call_update",
        name: "set_timeline_document",
        args: { timeline_id: "bad" }
      }),
      JSON.stringify({
        type: "tool_result_update",
        tool_call_id: "exec_2",
        name: "execute_code",
        result: {
          value: JSON.stringify({ ok: false, error: "schema_invalid: durationMs" })
        }
      })
    ];
    const result = parseTimelineRunEvents(lines);
    expect(result.timelineId).toBe("good");
    expect(result.errors).toEqual([
      "execute_code: schema_invalid: durationMs"
    ]);
  });

  it("falls back to create_timeline when no set_timeline_document ever ran", () => {
    const lines = [
      JSON.stringify({
        type: "tool_call_update",
        name: "create_timeline",
        tool_call_id: "call_1",
        args: { timeline_id: "created-only" }
      })
    ];
    expect(parseTimelineRunEvents(lines).timelineId).toBe("created-only");
  });

  it("counts every tool call by name, including ones that carry no timeline id", () => {
    const lines = [
      JSON.stringify({ type: "tool_call_update", name: "load_skill", args: { name: "motion-direction" } }),
      JSON.stringify({ type: "tool_call_update", name: "load_skill", args: { name: "motion-principles" } }),
      JSON.stringify({ type: "tool_call_update", name: "preview_timeline_frame", args: {} })
    ];
    const result = parseTimelineRunEvents(lines);
    expect(result.toolCallCounts).toEqual({
      load_skill: 2,
      preview_timeline_frame: 1
    });
    expect(result.timelineId).toBeNull();
    expect(result.eventCount).toBe(3);
  });

  it("reports eventCount 0 for a file with no parseable JSON — a capture failure, not a quiet run", () => {
    // This is exactly the real bug: the final answer's prose landed in
    // events.jsonl because agent run's --json trace (stderr) was never
    // captured, only stdout was.
    const lines = [
      'Both craft touches land: the timer ticks now ring the focus dial.',
      '- **Timeline id:** `523c891bba5b4a15a1ca51539bdce3ff` — 1920x1080, 30fps.'
    ];
    const result = parseTimelineRunEvents(lines);
    expect(result.eventCount).toBe(0);
    expect(result.timelineId).toBeNull();
  });
});

describe("extractTimelineIdFromAnswer", () => {
  it("finds a bare 32-hex id named in the agent's closing summary", () => {
    const answer =
      'Halo — "Deep work, protected." is saved as a timeline you can open in the editor now.\n\n' +
      '- **Timeline id:** `523c891bba5b4a15a1ca51539bdce3ff` — 1920×1080, 30fps, 20.07s.';
    expect(extractTimelineIdFromAnswer(answer)).toBe(
      "523c891bba5b4a15a1ca51539bdce3ff"
    );
  });

  it("returns null when nothing hex-32 appears", () => {
    expect(extractTimelineIdFromAnswer("The piece is done.")).toBeNull();
  });

  it("returns null for non-string input rather than throwing", () => {
    expect(extractTimelineIdFromAnswer(undefined)).toBeNull();
    expect(extractTimelineIdFromAnswer(null)).toBeNull();
  });
});

describe("runProcessSplitOutputs", () => {
  let workDir;

  afterEach(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it("writes stderr to the events file and returns stdout as the answer, trimmed", async () => {
    workDir = await mkdtemp(join(tmpdir(), "motion-craft-eval-"));
    const eventsPath = join(workDir, "events.jsonl");
    const script =
      'process.stderr.write(JSON.stringify({type:"tool_call_update",name:"x"}) + "\\n");' +
      'process.stdout.write("  the final answer  \\n");';
    const result = await runProcessSplitOutputs(
      process.execPath,
      ["-e", script],
      {},
      eventsPath
    );
    expect(result.code).toBe(0);
    expect(result.answer).toBe("the final answer");
    const events = await readFile(eventsPath, "utf8");
    expect(events).toContain('"name":"x"');
    expect(events).not.toContain("the final answer");
  });

  it("propagates a non-zero exit code without losing the captured answer", async () => {
    workDir = await mkdtemp(join(tmpdir(), "motion-craft-eval-"));
    const eventsPath = join(workDir, "events.jsonl");
    const script = 'process.stdout.write("partial"); process.exit(3);';
    const result = await runProcessSplitOutputs(
      process.execPath,
      ["-e", script],
      {},
      eventsPath
    );
    expect(result.code).toBe(3);
    expect(result.answer).toBe("partial");
  });
});
