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
