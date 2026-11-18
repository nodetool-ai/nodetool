/**
 * Per-run counts of the mistakes the harness now corrects: repeated calls,
 * ReferenceErrors, refused imports, unknown storyboard ops and revision
 * conflicts. The eval prints their means next to the pass rate.
 */
import { describe, expect, it } from "vitest";
import {
  countRunBehaviour,
  normalizeCallArguments,
  traceRunBehaviour
} from "../src/finetune/run-behaviour.js";
import type { ChatTrace } from "../src/finetune/sft-export.js";

const action = (code: string, title = "step") => ({
  name: "execute_code",
  arguments: { title, code }
});

describe("countRunBehaviour", () => {
  it("counts a call repeated with only whitespace, comments or its title changed", () => {
    const counts = countRunBehaviour(
      [
        action("const a = 1;\nreturn a;"),
        action("// try again\nconst a=1;   return a; /* same */", "retry"),
        action("const a = 2;\nreturn a;"),
        action("const a = 2;\nreturn a;")
      ],
      []
    );
    expect(counts.repeatedCalls).toBe(2);
  });

  it("does not count calls that differ inside a string or are not consecutive", () => {
    const counts = countRunBehaviour(
      [
        action('return "a  b";'),
        action('return "a b";'),
        action("return 1;"),
        action('return "a b";')
      ],
      []
    );
    expect(counts.repeatedCalls).toBe(0);
  });

  it("keeps // inside a string when it strips comments", () => {
    expect(normalizeCallArguments("execute_code", { code: 'return "https://x";' })).not.toEqual(
      normalizeCallArguments("execute_code", { code: 'return "https:' })
    );
  });

  it("reads JSON-string arguments the way OpenAI-format traces carry them", () => {
    const counts = countRunBehaviour(
      [
        { name: "edit_storyboard", arguments: '{"ops":[1],"storyboard_id":"b"}' },
        { name: "edit_storyboard", arguments: { storyboard_id: "b", ops: [1] } }
      ],
      []
    );
    expect(counts.repeatedCalls).toBe(1);
  });

  it("classifies tool results", () => {
    const counts = countRunBehaviour(
      [],
      [
        JSON.stringify({ ok: false, error: "ReferenceError: 'get_board' is not defined" }),
        JSON.stringify({
          ok: false,
          error:
            "`get_board` is not defined in this action. Nothing carries over between actions; add `import { get_board } from \"x\";`."
        }),
        JSON.stringify({
          ok: false,
          error: 'The action imports "find_x" from "y", which that module does not export. y exports: a.'
        }),
        JSON.stringify({ ok: true, result: { error: 'ops[0] names "add_shots"; expected one of add_shot, remove_shot.' } }),
        JSON.stringify({ ok: true, result: { error: "Storyboard revision conflict. Refresh the board before editing." } }),
        JSON.stringify({ error: "document_revision_conflict" }),
        JSON.stringify({ ok: true, result: 1 })
      ]
    );
    expect(counts).toEqual({
      repeatedCalls: 0,
      referenceErrors: 1,
      importErrors: 2,
      unknownOps: 1,
      revisionConflicts: 2
    });
  });
});

describe("traceRunBehaviour", () => {
  const reply = (code: string) => ({
    reply: {
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: "execute_code", arguments: JSON.stringify({ title: "t", code }) } }]
    },
    doneReason: "stop",
    promptTokens: 1,
    evalTokens: 1,
    status: 200,
    costUsd: null,
    messageCount: 1
  });
  const base: Pick<ChatTrace, "replies" | "finalRequest"> = {
    replies: [reply("return x;"), reply("return x;"), { ...reply(""), reply: { role: "assistant", content: "Done." } }],
    finalRequest: {
      messages: [
        { role: "user", content: "go" },
        { role: "tool", content: JSON.stringify({ ok: false, error: "ReferenceError: 'x' is not defined" }) },
        { role: "tool", content: JSON.stringify({ ok: false, error: "ReferenceError: 'x' is not defined" }) }
      ],
      tools: []
    }
  };

  it("computes the counters from a trace line that predates them", () => {
    expect(traceRunBehaviour(base)).toEqual({
      repeatedCalls: 1,
      referenceErrors: 2,
      importErrors: 0,
      unknownOps: 0,
      revisionConflicts: 0
    });
  });

  it("leaves them blank when the trace has no final request", () => {
    expect(traceRunBehaviour({ ...base, finalRequest: null })).toBeNull();
  });
});
