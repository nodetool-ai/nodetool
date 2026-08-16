/**
 * The two headless tools that link a script and a storyboard:
 * `extract_script_from_storyboard` (board → script) and
 * `derive_storyboard_from_script` (script → board), plus the link, drift and
 * orphan summaries `get_storyboard` / `get_script` report.
 *
 * Everything here is deterministic: the extraction and the scaffold are pure
 * functions from `@nodetool-ai/protocol`, and the director pass runs against a
 * scripted provider so the normalizer's reject-and-retry is exercised without a
 * network call.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  ModelObserver,
  Script,
  Storyboard,
  initTestDb
} from "@nodetool-ai/models";
import type { ScriptLine } from "@nodetool-ai/models";
import type { Shot } from "@nodetool-ai/protocol";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";

const run = (context: ProcessingContext) =>
  createCapabilityRun({ context, gate: UNGATED });

/** A context with no provider — the deterministic half of both tools. */
const plainContext = (userId = "u1"): ProcessingContext =>
  ({ userId }) as unknown as ProcessingContext;

/**
 * A context whose language model answers with `replies[n]` on the nth call.
 * `null` stands for "no tool call at all", which the normalizer must refuse the
 * same way it refuses a broken one.
 */
function directorContext(replies: unknown[]): {
  context: ProcessingContext;
  generateMessage: ReturnType<typeof vi.fn>;
} {
  let call = 0;
  const generateMessage = vi.fn(async () => {
    const reply = replies[Math.min(call, replies.length - 1)];
    call += 1;
    return {
      role: "assistant",
      content: "",
      toolCalls: reply ? [{ id: "c1", name: "shots", args: reply }] : []
    };
  });
  return {
    context: {
      userId: "u1",
      getProvider: vi.fn(async () => ({ generateMessage }))
    } as unknown as ProcessingContext,
    generateMessage
  };
}

const shot = (overrides: Partial<Shot> & { id: string; index: number }): Shot =>
  ({
    type: "shot",
    action: `action ${overrides.index}`,
    status: "planned",
    ...overrides
  }) as Shot;

async function makeBoard(shots: Shot[]): Promise<Storyboard> {
  return Storyboard.create<Storyboard>({
    user_id: "u1",
    project_id: "default",
    name: "Board",
    document: JSON.stringify({
      screenplay: null,
      shots,
      brief: "",
      style: "",
      entityIds: [],
      aspectRatio: "16:9",
      directorModel: null,
      imageModel: null,
      videoModel: null
    })
  });
}

const line = (overrides: Partial<ScriptLine> & { id: string }): ScriptLine => ({
  text: "A line",
  takes: [],
  ...overrides
});

async function makeScript(lines: ScriptLine[]): Promise<Script> {
  return Script.create<Script>({
    user_id: "u1",
    project_id: "default",
    name: "Script",
    document: JSON.stringify({
      cast: [{ id: "sp1", name: "Keeper", voice: null }],
      sections: [{ id: "sec1", title: "Main", lines }]
    })
  });
}

interface LinkSummary {
  linked: boolean;
  script_id: string | null;
  drifted_shot_ids: string[];
  orphan_line_ids: string[];
  issues: string[];
}

describe("extract_script_from_storyboard", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  const spokenBoard = () =>
    makeBoard([
      shot({ id: "s1", index: 0, dialogue: "The light goes out tonight." }),
      shot({ id: "s2", index: 1, narration: "He had kept it forty years." }),
      shot({ id: "s3", index: 2 })
    ]);

  it("creates the script, stamps the link, and leaves silent shots alone", async () => {
    const board = await spokenBoard();
    const context = plainContext();

    const result = (await run(context).invoke("extract_script_from_storyboard", {
      storyboard_id: board.id
    })) as {
      ok: boolean;
      script_id: string;
      line_count: number;
      linked_shot_ids: string[];
    };
    expect(result.ok).toBe(true);
    expect(result.line_count).toBe(2);
    expect(result.linked_shot_ids).toEqual(["s1", "s2"]);

    const script = await Script.findById(result.script_id);
    expect(script?.name).toBe("Board script");
    expect(
      script?.toDocument().sections[0].lines.map((l) => l.text)
    ).toEqual(["The light goes out tonight.", "He had kept it forty years."]);

    const read = (await run(context).invoke("get_storyboard", {
      storyboard_id: board.id
    })) as {
      script_id: string | null;
      script_link: LinkSummary;
      shots: Array<{ id: string; script_line_ids: string[] }>;
    };
    expect(read.script_id).toBe(result.script_id);
    expect(read.script_link).toMatchObject({
      linked: true,
      drifted_shot_ids: [],
      orphan_line_ids: [],
      issues: []
    });
    expect(read.shots.map((s) => s.script_line_ids.length)).toEqual([1, 1, 0]);
  });

  it("refuses a second extract unless relink is passed", async () => {
    const board = await spokenBoard();
    const context = plainContext();
    const first = (await run(context).invoke("extract_script_from_storyboard", {
      storyboard_id: board.id
    })) as { script_id: string };

    const refused = (await run(context).invoke(
      "extract_script_from_storyboard",
      { storyboard_id: board.id }
    )) as { error: string };
    expect(refused.error).toContain("already links script");

    // A rewritten line no longer matches the text the shot last projected.
    const lineId = (await Script.findById(first.script_id))!.toDocument()
      .sections[0].lines[0].id;
    await run(context).invoke("edit_script", {
      script_id: first.script_id,
      ops: [{ op: "set_line_text", target: lineId, text: "Not tonight." }]
    });
    const drifted = (await run(context).invoke("get_storyboard", {
      storyboard_id: board.id
    })) as { script_link: LinkSummary };
    expect(drifted.script_link.drifted_shot_ids).toEqual(["s1"]);

    // Extraction is board-authoritative, so re-projecting rewrites that line
    // from the shot it came from and clears the drift.
    const relinked = (await run(context).invoke(
      "extract_script_from_storyboard",
      { storyboard_id: board.id, relink: true }
    )) as { ok: boolean; script_id: string; relinked: boolean };
    expect(relinked).toMatchObject({
      ok: true,
      relinked: true,
      script_id: first.script_id
    });

    const after = (await run(context).invoke("get_storyboard", {
      storyboard_id: board.id
    })) as { script_link: LinkSummary };
    expect(after.script_link.drifted_shot_ids).toEqual([]);
    const script = await Script.findById(first.script_id);
    expect(script?.toDocument().sections[0].lines[0].text).toBe(
      "The light goes out tonight."
    );
  });

  it("reports a board with no spoken words instead of creating an empty script", async () => {
    const board = await makeBoard([shot({ id: "s1", index: 0 })]);
    const result = (await run(plainContext()).invoke(
      "extract_script_from_storyboard",
      { storyboard_id: board.id }
    )) as { error: string };
    expect(result.error).toContain("nothing to extract");
    expect(await Script.listByUser("u1")).toHaveLength(0);
  });

  it("reports an orphan when a line no shot covers is added to the script", async () => {
    const board = await spokenBoard();
    const context = plainContext();
    const extracted = (await run(context).invoke(
      "extract_script_from_storyboard",
      { storyboard_id: board.id }
    )) as { script_id: string };

    await run(context).invoke("edit_script", {
      script_id: extracted.script_id,
      ops: [{ op: "add_line", text: "A line no shot covers." }]
    });

    const read = (await run(context).invoke("get_storyboard", {
      storyboard_id: board.id
    })) as { script_link: LinkSummary };
    expect(read.script_link.orphan_line_ids).toHaveLength(1);

    const script = (await run(context).invoke("get_script", {
      script_id: extracted.script_id
    })) as {
      storyboard_id: string | null;
      lines: Array<{ id: string; shot_id: string | null; orphaned: boolean }>;
    };
    expect(script.storyboard_id).toBe(board.id);
    expect(script.lines.map((l) => l.shot_id)).toEqual(["s1", "s2", null]);
    expect(script.lines.map((l) => l.orphaned)).toEqual([false, false, true]);
  });
});

describe("derive_storyboard_from_script", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  const writtenScript = () =>
    makeScript([
      line({ id: "l1", speakerId: "sp1", text: "The tide came in." }),
      line({ id: "l2", speakerId: "sp1", text: "It took the boats." })
    ]);

  it("emits the deterministic scaffold when no provider is named", async () => {
    const script = await writtenScript();
    const context = plainContext();

    const result = (await run(context).invoke("derive_storyboard_from_script", {
      script_id: script.id
    })) as {
      ok: boolean;
      storyboard_id: string;
      directed: boolean;
      director_rounds: number;
      shots: Array<{ action: string; status: string; script_line_ids: string[] }>;
    };
    expect(result).toMatchObject({ ok: true, directed: false, director_rounds: 0 });
    expect(result.shots).toEqual([
      {
        id: expect.any(String),
        index: 0,
        slug: undefined,
        action: "The tide came in.",
        status: "planned",
        script_line_ids: ["l1"]
      },
      {
        id: expect.any(String),
        index: 1,
        slug: undefined,
        action: "It took the boats.",
        status: "planned",
        script_line_ids: ["l2"]
      }
    ]);

    const read = (await run(context).invoke("get_storyboard", {
      storyboard_id: result.storyboard_id
    })) as { script_id: string | null; script_link: LinkSummary };
    expect(read.script_id).toBe(script.id);
    expect(read.script_link).toMatchObject({
      linked: true,
      drifted_shot_ids: [],
      orphan_line_ids: [],
      issues: []
    });
  });

  it("names find_model when only one half of the model is given", async () => {
    const script = await writtenScript();
    const result = (await run(plainContext()).invoke(
      "derive_storyboard_from_script",
      { script_id: script.id, provider: "anthropic" }
    )) as { error: string };
    expect(result.error).toContain("find_model");
    expect(await Storyboard.listByUser("u1")).toHaveLength(0);
  });

  it("takes a director response that keeps every shot's line ids", async () => {
    const script = await writtenScript();
    const { context, generateMessage } = directorContext([
      {
        shots: [
          {
            script_line_ids: ["l1"],
            action: "A wave breaks over the harbour wall.",
            slug: "The tide",
            camera: { framing: "wide" }
          },
          {
            script_line_ids: ["l2"],
            action: "Empty moorings slap in the swell.",
            motion: "slow pan"
          }
        ]
      }
    ]);

    const result = (await run(context).invoke("derive_storyboard_from_script", {
      script_id: script.id,
      provider: "anthropic",
      model: "claude-sonnet-5"
    })) as {
      directed: boolean;
      director_rounds: number;
      shots: Array<{ action: string; slug?: string; script_line_ids: string[] }>;
    };
    expect(generateMessage).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ directed: true, director_rounds: 1 });
    expect(result.shots[0].action).toBe("A wave breaks over the harbour wall.");
    expect(result.shots[0].slug).toBe("The tide");
    expect(result.shots.map((s) => s.script_line_ids)).toEqual([["l1"], ["l2"]]);
  });

  it("retries a response that reassigns the line ids, then takes the fixed one", async () => {
    const script = await writtenScript();
    const { context, generateMessage } = directorContext([
      // Both lines swept into one shot: the linkage the scaffold pinned is gone.
      { shots: [{ script_line_ids: ["l1", "l2"], action: "Everything at once." }] },
      {
        shots: [
          { script_line_ids: ["l1"], action: "A wave breaks." },
          { script_line_ids: ["l2"], action: "Empty moorings." }
        ]
      }
    ]);

    const result = (await run(context).invoke("derive_storyboard_from_script", {
      script_id: script.id,
      provider: "anthropic",
      model: "claude-sonnet-5"
    })) as {
      directed: boolean;
      director_rounds: number;
      note?: string;
      shots: Array<{ action: string }>;
    };
    expect(generateMessage).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ directed: true, director_rounds: 2 });
    expect(result.note).toBeUndefined();
    expect(result.shots.map((s) => s.action)).toEqual([
      "A wave breaks.",
      "Empty moorings."
    ]);
  });

  it("falls back to the scaffold when every director round is refused", async () => {
    const script = await writtenScript();
    const { context, generateMessage } = directorContext([
      // Keeps the ids, drops the action the shot exists to carry.
      {
        shots: [
          { script_line_ids: ["l1"], action: "" },
          { script_line_ids: ["l2"], action: "Empty moorings." }
        ]
      }
    ]);

    const result = (await run(context).invoke("derive_storyboard_from_script", {
      script_id: script.id,
      provider: "anthropic",
      model: "claude-sonnet-5"
    })) as {
      ok: boolean;
      directed: boolean;
      director_rounds: number;
      note?: string;
      shots: Array<{ action: string; status: string }>;
    };
    expect(generateMessage).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, directed: false, director_rounds: 2 });
    expect(result.note).toContain("no `action`");
    expect(result.shots.map((s) => s.action)).toEqual([
      "The tide came in.",
      "It took the boats."
    ]);
    expect(result.shots.every((s) => s.status === "planned")).toBe(true);
  });

  it("reports a script with no written line instead of creating an empty board", async () => {
    const script = await makeScript([line({ id: "l1", text: "  " })]);
    const result = (await run(plainContext()).invoke(
      "derive_storyboard_from_script",
      { script_id: script.id }
    )) as { error: string };
    expect(result.error).toContain("nothing to storyboard");
    expect(await Storyboard.listByUser("u1")).toHaveLength(0);
  });
});
