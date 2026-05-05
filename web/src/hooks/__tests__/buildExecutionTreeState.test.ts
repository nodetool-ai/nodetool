/**
 * @jest-environment node
 */
import { buildExecutionTreeState } from "../useExecutionTreeState";
import type { Message } from "../../stores/ApiTypes";

function makeMessage(
  eventType: string,
  content: Record<string, unknown>
): Message {
  return {
    role: "agent_execution",
    execution_event_type: eventType,
    content: content
  } as unknown as Message;
}

describe("buildExecutionTreeState", () => {
  describe("idle state", () => {
    it("returns idle state for empty messages", () => {
      const state = buildExecutionTreeState([]);
      expect(state.phase).toBe("idle");
      expect(state.tasks).toEqual([]);
      expect(state.planningLog).toEqual([]);
      expect(state.logs).toEqual([]);
    });

    it("ignores non-agent_execution messages", () => {
      const messages: Message[] = [
        { role: "user", content: "hello" } as unknown as Message,
        { role: "assistant", content: "hi" } as unknown as Message
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.phase).toBe("idle");
    });
  });

  describe("planning phase", () => {
    it("transitions to planning phase on planning_update", () => {
      const messages = [
        makeMessage("planning_update", {
          phase: "analyzing",
          status: "Running",
          content: "Analyzing the task..."
        })
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.phase).toBe("planning");
      expect(state.planningContent).toBe("Analyzing the task...");
    });

    it("accumulates planning log entries", () => {
      const messages = [
        makeMessage("planning_update", {
          phase: "analyzing",
          status: "Running",
          content: "Step 1"
        }),
        makeMessage("planning_update", {
          phase: "complete",
          status: "Done",
          content: "Step 2"
        })
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.planningLog).toHaveLength(2);
      expect(state.planningLog[0].phase).toBe("analyzing");
      expect(state.planningLog[1].phase).toBe("complete");
    });

    it("sets phase to done when planning fails", () => {
      const messages = [
        makeMessage("planning_update", {
          phase: "complete",
          status: "Failed",
          content: "Planning failed"
        })
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.phase).toBe("done");
    });
  });

  describe("task lifecycle", () => {
    it("creates a task on task_created event", () => {
      const messages = [
        makeMessage("task_update", {
          event: "task_created",
          task: {
            id: "task-1",
            title: "Research",
            steps: [
              { id: "step-1", instructions: "Search the web" },
              { id: "step-2", instructions: "Summarize findings" }
            ]
          }
        })
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.phase).toBe("executing");
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0].id).toBe("task-1");
      expect(state.tasks[0].name).toBe("Research");
      expect(state.tasks[0].steps).toHaveLength(2);
      expect(state.tasks[0].steps[0].status).toBe("waiting");
    });

    it("marks step as running on step_started", () => {
      const messages = [
        makeMessage("task_update", {
          event: "task_created",
          task: {
            id: "task-1",
            title: "Test",
            steps: [{ id: "step-1", instructions: "Do something" }]
          }
        }),
        makeMessage("task_update", {
          event: "step_started",
          task: { id: "task-1" },
          step: { id: "step-1" }
        })
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.tasks[0].steps[0].status).toBe("running");
    });

    it("marks step as completed on step_completed", () => {
      const messages = [
        makeMessage("task_update", {
          event: "task_created",
          task: {
            id: "task-1",
            title: "Test",
            steps: [{ id: "step-1", instructions: "Do it" }]
          }
        }),
        makeMessage("task_update", {
          event: "step_completed",
          task: { id: "task-1" },
          step: { id: "step-1" }
        })
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.tasks[0].steps[0].status).toBe("completed");
    });

    it("marks step as failed on step_failed", () => {
      const messages = [
        makeMessage("task_update", {
          event: "task_created",
          task: {
            id: "task-1",
            title: "Test",
            steps: [{ id: "step-1", instructions: "Failing step" }]
          }
        }),
        makeMessage("task_update", {
          event: "step_failed",
          task: { id: "task-1" },
          step: { id: "step-1" }
        })
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.tasks[0].steps[0].status).toBe("failed");
    });

    it("marks task as completed and collapses it", () => {
      const messages = [
        makeMessage("task_update", {
          event: "task_created",
          task: {
            id: "task-1",
            title: "Test",
            steps: [{ id: "step-1", instructions: "Step" }]
          }
        }),
        makeMessage("task_update", {
          event: "task_completed",
          task: { id: "task-1" }
        })
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.tasks[0].status).toBe("completed");
      expect(state.tasks[0].expanded).toBe(false);
    });

    it("sets phase to done when all tasks are completed", () => {
      const messages = [
        makeMessage("task_update", {
          event: "task_created",
          task: { id: "task-1", title: "T1", steps: [] }
        }),
        makeMessage("task_update", {
          event: "task_completed",
          task: { id: "task-1" }
        })
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.phase).toBe("done");
    });
  });

  describe("tool_call_update", () => {
    it("adds tool call to the correct step", () => {
      const messages = [
        makeMessage("task_update", {
          event: "task_created",
          task: {
            id: "task-1",
            title: "Test",
            steps: [{ id: "step-1", instructions: "Use tool" }]
          }
        }),
        makeMessage("task_update", {
          event: "step_started",
          task: { id: "task-1" },
          step: { id: "step-1" }
        }),
        makeMessage("tool_call_update", {
          node_id: "step-1",
          tool_call_id: "tc-1",
          name: "web_search",
          args: { query: "test query" }
        })
      ];
      const state = buildExecutionTreeState(messages);
      const step = state.tasks[0].steps[0];
      expect(step.toolName).toBe("web_search");
      expect(step.toolCalls).toHaveLength(1);
      expect(step.toolCalls[0].name).toBe("web_search");
      expect(step.toolCalls[0].args).toEqual({ query: "test query" });
    });

    it("updates existing tool call by id", () => {
      const messages = [
        makeMessage("task_update", {
          event: "task_created",
          task: {
            id: "task-1",
            title: "Test",
            steps: [{ id: "step-1", instructions: "Use tool" }]
          }
        }),
        makeMessage("task_update", {
          event: "step_started",
          task: { id: "task-1" },
          step: { id: "step-1" }
        }),
        makeMessage("tool_call_update", {
          node_id: "step-1",
          tool_call_id: "tc-1",
          name: "web_search",
          args: { query: "first" }
        }),
        makeMessage("tool_call_update", {
          node_id: "step-1",
          tool_call_id: "tc-1",
          name: "web_search",
          args: { query: "updated" },
          message: "Got results"
        })
      ];
      const state = buildExecutionTreeState(messages);
      const step = state.tasks[0].steps[0];
      expect(step.toolCalls).toHaveLength(1);
      expect(step.toolCalls[0].args).toEqual({ query: "updated" });
    });
  });

  describe("step_result", () => {
    it("sets step output from result", () => {
      const messages = [
        makeMessage("task_update", {
          event: "task_created",
          task: {
            id: "task-1",
            title: "Test",
            steps: [{ id: "step-1", instructions: "Produce output" }]
          }
        }),
        makeMessage("step_result", {
          step: { id: "step-1" },
          result: "Here is the answer"
        })
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.tasks[0].steps[0].output).toBe("Here is the answer");
      expect(state.tasks[0].steps[0].status).toBe("completed");
    });

    it("marks step as failed when result has error", () => {
      const messages = [
        makeMessage("task_update", {
          event: "task_created",
          task: {
            id: "task-1",
            title: "Test",
            steps: [{ id: "step-1", instructions: "Fail" }]
          }
        }),
        makeMessage("step_result", {
          step: { id: "step-1" },
          result: "",
          error: "Something went wrong"
        })
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.tasks[0].steps[0].status).toBe("failed");
      expect(state.tasks[0].steps[0].error).toBe("Something went wrong");
    });

    it("truncates long output to 200 chars", () => {
      const longResult = "x".repeat(500);
      const messages = [
        makeMessage("task_update", {
          event: "task_created",
          task: {
            id: "task-1",
            title: "Test",
            steps: [{ id: "step-1", instructions: "Long output" }]
          }
        }),
        makeMessage("step_result", {
          step: { id: "step-1" },
          result: longResult
        })
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.tasks[0].steps[0].output.length).toBe(200);
      expect(state.tasks[0].steps[0].rawResult).toBe(longResult);
    });
  });

  describe("log_update", () => {
    it("accumulates log entries", () => {
      const messages = [
        makeMessage("log_update", {
          node_id: "node-1",
          content: "Processing started",
          severity: "info"
        }),
        makeMessage("log_update", {
          node_id: "node-2",
          content: "Warning occurred",
          severity: "warn"
        })
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.logs).toHaveLength(2);
      expect(state.logs[0]).toEqual({
        nodeId: "node-1",
        content: "Processing started",
        severity: "info"
      });
      expect(state.logs[1]).toEqual({
        nodeId: "node-2",
        content: "Warning occurred",
        severity: "warn"
      });
    });
  });

  describe("dynamic step creation", () => {
    it("creates a new step when step_started references unknown step id", () => {
      const messages = [
        makeMessage("task_update", {
          event: "task_created",
          task: { id: "task-1", title: "Test", steps: [] }
        }),
        makeMessage("task_update", {
          event: "step_started",
          task: { id: "task-1" },
          step: { id: "dynamic-step", instructions: "Dynamically added" }
        })
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.tasks[0].steps).toHaveLength(1);
      expect(state.tasks[0].steps[0].id).toBe("dynamic-step");
      expect(state.tasks[0].steps[0].status).toBe("running");
    });
  });

  describe("message content normalization", () => {
    it("parses JSON string content", () => {
      const messages: Message[] = [
        {
          role: "agent_execution",
          execution_event_type: undefined,
          content: JSON.stringify({
            type: "planning_update",
            phase: "start",
            status: "Running",
            content: "From JSON"
          })
        } as unknown as Message
      ];
      const state = buildExecutionTreeState(messages);
      expect(state.phase).toBe("planning");
      expect(state.planningContent).toBe("From JSON");
    });
  });
});
