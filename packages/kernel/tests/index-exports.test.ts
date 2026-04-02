/**
 * Barrel export coverage for @nodetool/kernel index.ts
 */
import { describe, it, expect } from "vitest";
import {
  Graph,
  GraphValidationError,
  NodeInbox,
  NodeActor,
  WorkflowRunner
} from "../src/index.js";
import type {
  MessageEnvelope,
  NodeExecutor,
  ActorResult,
  RunJobRequest,
  WorkflowRunnerOptions,
  RunResult
} from "../src/index.js";

describe("@nodetool/kernel barrel exports", () => {
  it("exports Graph class", () => {
    expect(Graph).toBeDefined();
    expect(typeof Graph).toBe("function");
  });

  it("exports GraphValidationError class", () => {
    expect(GraphValidationError).toBeDefined();
    const err = new GraphValidationError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("GraphValidationError");
  });

  it("exports NodeInbox class", () => {
    expect(NodeInbox).toBeDefined();
    const inbox = new NodeInbox();
    expect(inbox).toBeInstanceOf(NodeInbox);
  });

  it("exports NodeActor class", () => {
    expect(NodeActor).toBeDefined();
  });

  it("exports WorkflowRunner class", () => {
    expect(WorkflowRunner).toBeDefined();
  });
});
