import { describe, expect, it } from "vitest";
import {
  isConnectionControlMessage,
  stripRelayOnlyFields
} from "../src/drivers/relay-fields.js";

describe("stripRelayOnlyFields", () => {
  it("drops job_id on the types the relay backfills it onto", () => {
    for (const type of ["node_update", "generation_complete", "output_update", "llm_call"]) {
      expect(stripRelayOnlyFields({ type, job_id: "j-1" })).toEqual({ type });
    }
  });

  it("keeps job_id on job_update and edge_update — the kernel stamps those itself", () => {
    // Dropping these would hide a real regression (the kernel silently
    // ceasing to stamp run identity) instead of a harmless relay addition.
    expect(stripRelayOnlyFields({ type: "job_update", job_id: "j-1" })).toEqual({
      type: "job_update",
      job_id: "j-1"
    });
    expect(stripRelayOnlyFields({ type: "edge_update", job_id: "j-1" })).toEqual({
      type: "edge_update",
      job_id: "j-1"
    });
  });

  it("drops workflow_id on relay-enriched types, including edge_update", () => {
    for (const type of [
      "node_update",
      "generation_complete",
      "output_update",
      "edge_update",
      "llm_call"
    ]) {
      expect(stripRelayOnlyFields({ type, workflow_id: "w-1" })).toEqual({ type });
    }
  });

  it("keeps workflow_id on job_update", () => {
    expect(stripRelayOnlyFields({ type: "job_update", workflow_id: "w-1" })).toEqual({
      type: "job_update",
      workflow_id: "w-1"
    });
  });

  it("drops generation_complete.index — an arrival-order stamp the kernel never sets", () => {
    expect(stripRelayOnlyFields({ type: "generation_complete", index: 0 })).toEqual({
      type: "generation_complete"
    });
  });

  it("does not mutate its argument", () => {
    const message = { type: "node_update", job_id: "j-1" };
    stripRelayOnlyFields(message);
    expect(message).toEqual({ type: "node_update", job_id: "j-1" });
  });
});

describe("isConnectionControlMessage", () => {
  it("recognizes sdk_execution_target", () => {
    expect(isConnectionControlMessage({ type: "sdk_execution_target", runner_id: "r-1" })).toBe(
      true
    );
  });

  it("recognizes the relay's wall-clock control frames", () => {
    for (const type of ["system_stats", "resource_change", "ping", "pong"]) {
      expect(isConnectionControlMessage({ type })).toBe(true);
    }
  });

  it("leaves run frames alone", () => {
    for (const type of ["job_update", "node_update", "edge_update", "output_update"]) {
      expect(isConnectionControlMessage({ type })).toBe(false);
    }
  });
});

/**
 * Regression guard for Ring 1 run 31619279663, which failed
 * `linear-text-pipeline` on the packaged surface and blocked the Fly deploy of
 * 2868cffe. `WebSocketClientSession.startStatsBroadcast` fires its first
 * sample ~1s after connect; that run took just long enough for it to land
 * between two `edge_update`s, shifting every later entry in the control
 * channel and mismatching the stream-shape golden by three. This is the exact
 * frame from that failure's log.
 */
describe("the frame that failed Ring 1 on 2868cffe", () => {
  it("is connection control, so no relay driver records it", () => {
    expect(
      isConnectionControlMessage({
        type: "system_stats",
        stats: {
          cpu_percent: 30.76923076923077,
          memory_percent: 13.05219544311343,
          memory_total: 16766423040,
          memory_total_gb: 15.614948272705078,
          memory_used: 2188386304,
          memory_used_gb: 2.0380935668945312
        }
      })
    ).toBe(true);
  });
});

/**
 * Regression guard for the Ring 2 release gate (run 30927453380, tag
 * v0.7.0-rc.33): the packaged surface is a relay just like ws-server, but
 * `packaged.ts` never applied the relay-field policy, so every packaged
 * release run diffed relay-stamped frames against the bare kernel oracle and
 * failed. These are the exact frames from that failure's log.
 */
describe("the frames that failed Ring 2 on v0.7.0-rc.33", () => {
  it("reduces each one to the kernel's bare shape", () => {
    expect(
      stripRelayOnlyFields({
        type: "edge_update",
        counter: 1,
        edge_id: "e-0",
        job_id: "j-0",
        status: "active",
        workflow_id: "w-0"
      })
    ).toEqual({ type: "edge_update", counter: 1, edge_id: "e-0", job_id: "j-0", status: "active" });

    expect(
      stripRelayOnlyFields({
        type: "node_update",
        error: null,
        job_id: "j-0",
        node_id: "n-1",
        node_name: "out1",
        node_type: "nodetool.output.Output",
        properties: { name: "result" },
        provider_cost: null,
        result: null,
        status: "running"
      })
    ).toEqual({
      type: "node_update",
      error: null,
      node_id: "n-1",
      node_name: "out1",
      node_type: "nodetool.output.Output",
      properties: { name: "result" },
      provider_cost: null,
      result: null,
      status: "running"
    });

    expect(
      stripRelayOnlyFields({
        type: "output_update",
        disposition: "append",
        job_id: "j-0",
        metadata: {},
        node_id: "n-1",
        node_name: "out1",
        output_name: "result",
        output_type: "any",
        value: "HELLO RELIABILITY",
        workflow_id: "w-0"
      })
    ).toEqual({
      type: "output_update",
      disposition: "append",
      metadata: {},
      node_id: "n-1",
      node_name: "out1",
      output_name: "result",
      output_type: "any",
      value: "HELLO RELIABILITY"
    });

    expect(
      stripRelayOnlyFields({
        type: "generation_complete",
        index: 0,
        job_id: "j-0",
        node_id: "n-0",
        node_name: "upper1",
        node_type: "nodetool.text.ToUppercase",
        outputs: { output: "HELLO RELIABILITY" },
        properties: { text: "hello reliability" }
      })
    ).toEqual({
      type: "generation_complete",
      node_id: "n-0",
      node_name: "upper1",
      node_type: "nodetool.text.ToUppercase",
      outputs: { output: "HELLO RELIABILITY" },
      properties: { text: "hello reliability" }
    });

    expect(
      isConnectionControlMessage({
        type: "sdk_execution_target",
        runner_id: "e81fd54b-6544-4de9-a37c-18b6d843d440"
      })
    ).toBe(true);
  });
});
