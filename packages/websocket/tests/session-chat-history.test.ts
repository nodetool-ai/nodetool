/**
 * session/chat-history — the stored-message → provider-message conversions
 * and the workflow-result → message-content mapping, exercised as plain
 * functions with no socket and no database.
 */

import { describe, expect, it } from "vitest";
import {
  COMPACTION_EVENT_TYPE,
  compactionMessageContent,
  Message
} from "@nodetool-ai/models";
import type {
  MessageContent,
  Message as ProviderMessage
} from "@nodetool-ai/runtime";
import {
  appendContextToLastUser,
  createWorkflowResponseContent,
  dbMessageToProviderMessage,
  extractTextContent,
  historySinceCompaction,
  invokedSkillsSection,
  toolResultDisplayText
} from "../src/session/chat-history.js";
import {
  orphanedToolCallIds,
  repairOrphanedToolCalls
} from "../src/chat-tool-call-repair.js";

function dbMessage(data: Record<string, unknown>): Message {
  return new Message({ thread_id: "thread-1", user_id: "user-1", ...data });
}

describe("dbMessageToProviderMessage", () => {
  it("drops messages with non-provider roles", () => {
    expect(
      dbMessageToProviderMessage(dbMessage({ role: "agent_execution" }), null)
    ).toBeNull();
    // A legacy row can carry an empty role; the constructor only defaults an
    // absent one.
    expect(dbMessageToProviderMessage(dbMessage({ role: "" }), "user-1")).toBeNull();
  });

  it("maps a plain user message, defaulting null content to the empty string", () => {
    const out = dbMessageToProviderMessage(
      dbMessage({ role: "user", content: null }),
      "user-1"
    );
    expect(out).toEqual({
      role: "user",
      content: "",
      toolCallId: null,
      toolCalls: null,
      threadId: "thread-1"
    });
  });

  it("keeps string content and a string tool_call_id", () => {
    const out = dbMessageToProviderMessage(
      dbMessage({ role: "tool", content: "result", tool_call_id: "call-9" }),
      null
    );
    expect(out?.content).toBe("result");
    expect(out?.toolCallId).toBe("call-9");
  });

  it("resolves array content per block, passing text blocks through", () => {
    const out = dbMessageToProviderMessage(
      dbMessage({
        role: "user",
        content: [{ type: "text", text: "hello" }]
      }),
      "conn-user"
    );
    expect(out?.content).toEqual([{ type: "text", text: "hello" }]);
  });

  it("falls back to the connection user when the row has no user_id", () => {
    const out = dbMessageToProviderMessage(
      new Message({
        thread_id: "thread-1",
        role: "user",
        content: [{ type: "text", text: "hi" }]
      }),
      "conn-user"
    );
    expect(out?.content).toEqual([{ type: "text", text: "hi" }]);
  });

  it("resolves array content with no user at all", () => {
    const out = dbMessageToProviderMessage(
      new Message({
        thread_id: "thread-1",
        role: "user",
        content: [{ type: "text", text: "anon" }]
      }),
      null
    );
    expect(out?.content).toEqual([{ type: "text", text: "anon" }]);
  });

  it("copies tool calls, carrying thought_signature only when it is a string", () => {
    const out = dbMessageToProviderMessage(
      dbMessage({
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "a", name: "one", args: { x: 1 }, thought_signature: "sig" },
          { id: "b", name: "two", args: {}, thought_signature: 42 }
        ]
      }),
      null
    );
    expect(out?.toolCalls).toEqual([
      { id: "a", name: "one", args: { x: 1 }, thought_signature: "sig" },
      { id: "b", name: "two", args: {} }
    ]);
  });
});

describe("toolResultDisplayText", () => {
  it("joins the text items with newlines", () => {
    const content: MessageContent[] = [
      { type: "text", text: "line one" },
      { type: "image_url", image: { uri: "asset://x" } },
      { type: "text", text: "line two" }
    ];
    expect(toolResultDisplayText(content)).toBe("line one\nline two");
  });

  it("labels an image-only result", () => {
    const content: MessageContent[] = [
      { type: "image_url", image: { uri: "asset://x" } }
    ];
    expect(toolResultDisplayText(content)).toBe("[image result]");
    expect(toolResultDisplayText([])).toBe("[image result]");
  });
});

describe("appendContextToLastUser", () => {
  it("returns the messages untouched when no user message exists", () => {
    const messages: ProviderMessage[] = [
      { role: "assistant", content: "hi" },
      { role: "system", content: "sys" }
    ];
    expect(appendContextToLastUser(messages, "ctx")).toBe(messages);
  });

  it("appends to the last user message's string content, not an earlier one", () => {
    const messages: ProviderMessage[] = [
      { role: "user", content: "first" },
      { role: "assistant", content: "reply" },
      { role: "user", content: "second" },
      { role: "assistant", content: "tail" }
    ];
    const out = appendContextToLastUser(messages, "extra context");
    expect(out[0].content).toBe("first");
    expect(out[2].content).toBe("second\n\nextra context");
    expect(out[3]).toBe(messages[3]);
    // Input untouched — the function builds a new array.
    expect(messages[2].content).toBe("second");
  });

  it("treats null content as empty when appending", () => {
    const messages: ProviderMessage[] = [{ role: "user", content: null }];
    const out = appendContextToLastUser(messages, "only the context");
    expect(out[0].content).toBe("\n\nonly the context");
  });

  it("appends a text block when the target content is an array", () => {
    const messages: ProviderMessage[] = [
      { role: "user", content: [{ type: "text", text: "look" }] }
    ];
    const out = appendContextToLastUser(messages, "memo");
    expect(out[0].content).toEqual([
      { type: "text", text: "look" },
      { type: "text", text: "memo" }
    ]);
  });
});

describe("invokedSkillsSection", () => {
  const skills = [
    { name: "Deploy", description: "ship it", content: "  run the deploy  " },
    { name: "review", description: "look", content: "read the diff" }
  ];

  it("returns the empty string when the text names no skill", () => {
    expect(invokedSkillsSection(skills, "just chatting about src/deploy")).toBe(
      ""
    );
  });

  it("formats the bodies of the invoked skills, case-insensitively", () => {
    const out = invokedSkillsSection(skills, "please /deploy this");
    expect(out).toContain("## Skill instructions");
    expect(out).toContain("### /Deploy");
    expect(out).toContain("run the deploy");
    expect(out).not.toContain("read the diff");
  });
});

describe("createWorkflowResponseContent", () => {
  it("answers with a completion note when nothing survives the mapping", () => {
    expect(createWorkflowResponseContent({})).toEqual([
      { type: "text", text: "Workflow completed successfully." }
    ]);
    expect(
      createWorkflowResponseContent({ a: null, b: undefined })
    ).toEqual([{ type: "text", text: "Workflow completed successfully." }]);
  });

  it("maps strings, lists, scalars, and plain dicts to text content", () => {
    expect(
      createWorkflowResponseContent({
        s: "hello",
        l: [1, "a", true],
        n: 42,
        d: { foo: "bar" }
      })
    ).toEqual([
      { type: "text", text: "hello" },
      { type: "text", text: "1 a true" },
      { type: "text", text: "42" },
      { type: "text", text: '{"foo":"bar"}' }
    ]);
  });

  it("maps typed media dicts to media content", () => {
    expect(
      createWorkflowResponseContent({
        i: { type: "image", uri: "asset://i", asset_id: "a1" },
        v: { type: "video", uri: "asset://v", asset_id: "a2" },
        a: { type: "audio", uri: "asset://a", asset_id: "a3", data: "zzz" }
      })
    ).toEqual([
      {
        type: "image",
        image: { uri: "asset://i", asset_id: "a1", data: undefined }
      },
      {
        type: "video",
        video: { uri: "asset://v", asset_id: "a2", data: undefined }
      },
      {
        type: "audio",
        audio: { uri: "asset://a", asset_id: "a3", data: "zzz" }
      }
    ]);
  });
});

describe("extractTextContent", () => {
  it("returns a string as-is", () => {
    expect(extractTextContent("plain")).toBe("plain");
  });

  it("joins the text items of an array with spaces", () => {
    expect(
      extractTextContent([
        { type: "text", text: "a" },
        { type: "image", image: {} },
        { type: "text", text: "b" },
        { type: "text", text: 7 }
      ])
    ).toBe("a b");
  });

  it("falls back when the array holds no text and for other shapes", () => {
    expect(extractTextContent([{ type: "image" }], "fb")).toBe("fb");
    expect(extractTextContent(42, "fb")).toBe("fb");
    expect(extractTextContent(null)).toBe("");
  });
});

describe("historySinceCompaction", () => {
  /**
   * Sixty stored rows with a compaction record as the 40th. Every third row is
   * a tool result answering the assistant before it, so a cut in the wrong
   * place separates a `tool_use` from its `tool_result` — which Anthropic
   * rejects outright.
   */
  function thread(): Message[] {
    const rows: Message[] = [];
    const at = (n: number) =>
      `2026-01-01T00:00:00.${String(n).padStart(3, "0")}Z`;
    for (let i = 1; i <= 60; i++) {
      const base = { id: `m${i}`, created_at: at(i) };
      if (i === 40) {
        rows.push(
          dbMessage({
            ...base,
            role: "user",
            execution_event_type: COMPACTION_EVENT_TYPE,
            content: compactionMessageContent("The user wants a teal palette.")
          })
        );
      } else if (i % 3 === 1) {
        rows.push(dbMessage({ ...base, role: "user", content: `ask ${i}` }));
      } else if (i % 3 === 2) {
        rows.push(
          dbMessage({
            ...base,
            role: "assistant",
            content: `thinking ${i}`,
            tool_calls: [{ id: `call-${i}`, name: "search", args: {} }]
          })
        );
      } else {
        rows.push(
          dbMessage({
            ...base,
            role: "tool",
            content: `result ${i}`,
            tool_call_id: `call-${i - 1}`
          })
        );
      }
    }
    return rows;
  }

  const provider = (rows: readonly Message[]): ProviderMessage[] => {
    const out: ProviderMessage[] = [];
    for (const row of rows) {
      const pm = dbMessageToProviderMessage(row, "user-1");
      if (pm) out.push(pm);
    }
    return out;
  };

  /** Tool results whose call is not in the slice — the other broken cut. */
  const danglingToolResultIds = (messages: readonly ProviderMessage[]) => {
    const called = new Set<string>();
    for (const m of messages) {
      for (const call of m.toolCalls ?? []) called.add(call.id);
    }
    return messages
      .filter((m) => m.role === "tool" && m.toolCallId)
      .map((m) => m.toolCallId as string)
      .filter((id) => !called.has(id));
  };

  it("returns the rows unchanged when the thread was never compacted", () => {
    const rows = thread().filter((m) => m.id !== "m40");
    expect(historySinceCompaction(rows).map((m) => m.id)).toEqual(
      rows.map((m) => m.id)
    );
  });

  it("starts at the compaction record and keeps everything after it", () => {
    const kept = historySinceCompaction(thread());

    expect(kept).toHaveLength(21);
    expect(kept[0].id).toBe("m40");
    expect(kept[0].content).toContain("[Conversation so far]");
    expect(kept.map((m) => m.id)).toEqual([
      "m40",
      ...Array.from({ length: 20 }, (_, i) => `m${41 + i}`)
    ]);
  });

  it("cuts at the newest record when a thread was compacted twice", () => {
    const rows = thread();
    rows[9] = dbMessage({
      id: "m10",
      created_at: rows[9].created_at,
      role: "user",
      execution_event_type: COMPACTION_EVENT_TYPE,
      content: compactionMessageContent("an older summary")
    });

    expect(historySinceCompaction(rows)[0].id).toBe("m40");
  });

  it("cuts on a user-message boundary, splitting no tool-call pair", () => {
    const kept = provider(historySinceCompaction(thread()));

    expect(danglingToolResultIds(kept)).toEqual([]);
    expect(orphanedToolCallIds(kept)).toEqual([]);
    expect(kept[0].role).toBe("user");
    // Nothing to patch: the provider sees exactly the rows the cut kept.
    expect(repairOrphanedToolCalls(kept)).toHaveLength(kept.length);
  });

  it("changes the repair count when a cut does split a tool-call pair", () => {
    const kept = provider(historySinceCompaction(thread()));
    // m60 is the result answering m59's call; a cut that keeps the call and
    // drops the answer is the failure mode `repairOrphanedToolCalls` covers.
    const split = kept.slice(0, -1);

    expect(orphanedToolCallIds(split)).toEqual(["call-59"]);
    expect(repairOrphanedToolCalls(split)).toHaveLength(split.length + 1);
  });
});
