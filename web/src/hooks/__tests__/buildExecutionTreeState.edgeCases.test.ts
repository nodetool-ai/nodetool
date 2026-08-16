/**
 * @jest-environment node
 *
 * Covers buildExecutionTreeState branches not exercised by the sibling test:
 * - toolCallsByStep overlay
 * - Double-JSON content normalization
 * - Error type variants in step_result (Error object, non-string error)
 */
import { buildExecutionTreeState } from "../useExecutionTreeState";
import { stub } from "../../test-utils/doubles";
import type { Message } from "../../stores/ApiTypes";
import type { StepToolCall } from "../../stores/GlobalChatStore";

function makeMessage(
  eventType: string,
  content: Record<string, unknown>
): Message {
  return stub<Message>({
    role: "agent_execution",
    execution_event_type: eventType,
    content: content
  });
}

describe("buildExecutionTreeState — toolCallsByStep overlay", () => {
  it("attaches last tool name from toolCallsByStep to matching steps", () => {
    const messages = [
      makeMessage("task_update", {
        event: "task_created",
        task: {
          id: "task-1",
          title: "Test",
          steps: [
            { id: "step-1", instructions: "First" },
            { id: "step-2", instructions: "Second" }
          ]
        }
      })
    ];

    const toolCallsByStep: Record<string, StepToolCall[]> = {
      "step-1": [
        { id: "tc-a", name: "web_search", args: null, startedAt: 1000 },
        { id: "tc-b", name: "read_file", args: null, startedAt: 2000 }
      ],
      "step-2": [
        { id: "tc-c", name: "write_file", args: null, startedAt: 3000 }
      ]
    };

    const state = buildExecutionTreeState(messages, toolCallsByStep);
    expect(state.tasks[0].steps[0].toolName).toBe("read_file");
    expect(state.tasks[0].steps[1].toolName).toBe("write_file");
  });
});

describe("buildExecutionTreeState — content normalization edge cases", () => {
  it("handles double-JSON-encoded content", () => {
    const inner = {
      type: "planning_update",
      phase: "analyzing",
      status: "Running",
      content: "Double encoded"
    };
    const messages: Message[] = [
      stub<Message>({
        role: "agent_execution",
        execution_event_type: undefined,
        content: JSON.stringify(JSON.stringify(inner))
      })
    ];
    const state = buildExecutionTreeState(messages);
    expect(state.phase).toBe("planning");
    expect(state.planningContent).toBe("Double encoded");
  });

  it("skips tool_call_update without stepId", () => {
    const messages = [
      makeMessage("tool_call_update", {
        name: "orphan_tool",
        args: {}
      })
    ];
    const state = buildExecutionTreeState(messages);
    expect(state.tasks).toHaveLength(0);
  });

  it("handles step_result with non-string error", () => {
    const messages = [
      makeMessage("task_update", {
        event: "task_created",
        task: {
          id: "task-1",
          title: "Test",
          steps: [{ id: "step-1", instructions: "Fail with object" }]
        }
      }),
      makeMessage("step_result", {
        step: { id: "step-1" },
        result: "",
        error: { code: 500, message: "Internal error" }
      })
    ];
    const state = buildExecutionTreeState(messages);
    expect(state.tasks[0].steps[0].status).toBe("failed");
    expect(state.tasks[0].steps[0].error).toContain("500");
  });

  it("handles step_result with null error as completed", () => {
    const messages = [
      makeMessage("task_update", {
        event: "task_created",
        task: {
          id: "task-1",
          title: "Test",
          steps: [{ id: "step-1", instructions: "Succeed" }]
        }
      }),
      makeMessage("step_result", {
        step: { id: "step-1" },
        result: "ok",
        error: null
      })
    ];
    const state = buildExecutionTreeState(messages);
    expect(state.tasks[0].steps[0].status).toBe("completed");
    expect(state.tasks[0].steps[0].error).toBeUndefined();
  });

  it("handles step_result with no matching step (orphan)", () => {
    const messages = [
      makeMessage("task_update", {
        event: "task_created",
        task: {
          id: "task-1",
          title: "Test",
          steps: [{ id: "step-1", instructions: "Exists" }]
        }
      }),
      makeMessage("step_result", {
        step: { id: "nonexistent-step" },
        result: "lost"
      })
    ];
    const state = buildExecutionTreeState(messages);
    expect(state.tasks[0].steps[0].output).toBe("");
  });

  it("handles log_update with non-string content", () => {
    const messages = [
      makeMessage("log_update", {
        node_id: "node-1",
        content: { nested: "data" },
        severity: "info"
      })
    ];
    const state = buildExecutionTreeState(messages);
    expect(state.logs[0].content).toBe('{"nested":"data"}');
  });
});
