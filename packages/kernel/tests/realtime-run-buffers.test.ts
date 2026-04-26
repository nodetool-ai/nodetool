import { describe, expect, it } from "vitest";
import {
  REALTIME_MESSAGE_BUFFER_LIMIT,
  REALTIME_OUTPUT_BUFFER_LIMIT,
  RealtimeRunBuffers
} from "../src/realtime-run-buffers.js";

describe("RealtimeRunBuffers", () => {
  it("keeps a bounded tail of realtime processing messages", () => {
    const buffers = new RealtimeRunBuffers();

    for (let index = 0; index < REALTIME_MESSAGE_BUFFER_LIMIT + 3; index += 1) {
      buffers.appendMessage({
        type: "job_update",
        status: "running",
        job_id: `job-${index}`,
        workflow_id: null
      });
    }

    expect(buffers.messages).toHaveLength(REALTIME_MESSAGE_BUFFER_LIMIT);
    expect(buffers.messages[0]).toMatchObject({ job_id: "job-3" });
    expect(buffers.messages.at(-1)).toMatchObject({
      job_id: `job-${REALTIME_MESSAGE_BUFFER_LIMIT + 2}`
    });
  });

  it("keeps a bounded tail of realtime output values per output name", () => {
    const buffers = new RealtimeRunBuffers();

    for (let index = 0; index < REALTIME_OUTPUT_BUFFER_LIMIT + 4; index += 1) {
      buffers.appendOutputValue("preview", index);
    }

    const values = buffers.outputs.get("preview");
    expect(values).toHaveLength(REALTIME_OUTPUT_BUFFER_LIMIT);
    expect(values?.[0]).toBe(4);
    expect(values?.at(-1)).toBe(REALTIME_OUTPUT_BUFFER_LIMIT + 3);
  });
});
