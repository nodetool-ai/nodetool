import { describe, expect, it } from "vitest";

import { scriptStreamMessages } from "../src/script-run.js";

describe("scriptStreamMessages", () => {
  it("relays a run message under its loop's name, never a port's", () => {
    expect(
      scriptStreamMessages(
        {
          type: "message",
          message: { type: "chunk", node_id: "timeline", content: "hi", content_type: "text" }
        },
        "job-1"
      )
    ).toEqual([
      { type: "chunk", content: "hi", content_type: "text", job_id: "job-1", source: "timeline" }
    ]);
  });

  it("appends an emit to its port", () => {
    expect(scriptStreamMessages({ type: "emit", name: "status", value: "x" }, "job-1")).toEqual([
      {
        job_id: "job-1",
        type: "output_update",
        node_id: "status",
        output_name: "status",
        value: "x",
        disposition: "append"
      }
    ]);
  });

  it("settles the run from the result without replaying its emits", () => {
    const messages = scriptStreamMessages(
      {
        type: "result",
        result: {
          ok: true,
          outputs: { answer: "done" },
          streamed: [{ name: "status", value: "x" }],
          logs: [],
          duration_ms: 1
        }
      },
      "job-1"
    );
    expect(messages.map((message) => message.type)).toEqual([
      "output_update",
      "job_update"
    ]);
    expect(messages[0]).toMatchObject({ node_id: "answer", disposition: "replace" });
  });

  it("ignores a line it does not know", () => {
    expect(scriptStreamMessages({ type: "nonsense" }, "job-1")).toEqual([]);
    expect(scriptStreamMessages("text", "job-1")).toEqual([]);
  });
});
