import { describe, expect, it } from "vitest";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { attachChatPredictionForwarder } from "../src/chat-prediction-forwarder.js";

describe("attachChatPredictionForwarder", () => {
  it("forwards prediction events with thread_id and ignores other types", () => {
    const sent: Record<string, unknown>[] = [];
    let listener: ((msg: ProcessingMessage) => void) | null = null;
    const detach = attachChatPredictionForwarder(
      (fn) => {
        listener = fn;
        return () => {
          listener = null;
        };
      },
      (msg) => sent.push(msg),
      { threadId: "t1", workflowId: "w1" }
    );

    listener?.({
      type: "log_update",
      content: "nope"
    } as ProcessingMessage);
    listener?.({
      type: "prediction",
      id: "p1",
      user_id: "u1",
      node_id: "",
      provider: "fal_ai",
      model: "flux-schnell",
      capability: "text_to_image",
      status: "running"
    } as ProcessingMessage);

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "prediction",
      id: "p1",
      thread_id: "t1",
      workflow_id: "w1",
      provider: "fal_ai",
      model: "flux-schnell",
      capability: "text_to_image"
    });

    detach();
    expect(listener).toBeNull();
  });
});

describe("attachChatPredictionForwarder todo_update", () => {
  it("forwards the agent's task list so the chat can render it", () => {
    const sent: Record<string, unknown>[] = [];
    let listener: ((msg: ProcessingMessage) => void) | null = null;
    attachChatPredictionForwarder(
      (fn) => {
        listener = fn;
        return () => {
          listener = null;
        };
      },
      (msg) => sent.push(msg),
      { threadId: "t1" }
    );

    listener?.({
      type: "todo_update",
      thread_id: null,
      todos: [
        { content: "Generate the logo", status: "in_progress" },
        { content: "Write captions", status: "pending" }
      ]
    } as ProcessingMessage);

    expect(sent).toEqual([
      {
        type: "todo_update",
        thread_id: "t1",
        todos: [
          { content: "Generate the logo", status: "in_progress" },
          { content: "Write captions", status: "pending" }
        ]
      }
    ]);
  });
});
