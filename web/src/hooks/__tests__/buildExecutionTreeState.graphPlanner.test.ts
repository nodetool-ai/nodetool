/**
 * @jest-environment node
 *
 * Covers buildExecutionTreeState branches not exercised by the sibling test:
 * - Graph planner synthetic task creation (tool_call_update with node_id "graph_planner")
 * - Graph planner task completion via planning_update phase="complete"
 * - toolCallsByStep overlay
 * - Double-JSON content normalization
 * - Error type variants in step_result (Error object, non-string error)
 */
import { buildExecutionTreeState } from "../useExecutionTreeState";
import type { Message } from "../../stores/ApiTypes";
import type { StepToolCall } from "../../stores/GlobalChatStore";

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

describe("buildExecutionTreeState — graph planner", () => {
  it("creates a synthetic graph_planner task on first graph planner tool call", () => {
    const messages = [
      makeMessage("tool_call_update", {
        node_id: "graph_planner",
        tool_call_id: "tc-gp-1",
        name: "search_nodes",
        args: { query: "image generation" }
      })
    ];
    const state = buildExecutionTreeState(messages);

    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].id).toBe("graph_planner");
    expect(state.tasks[0].name).toBe("Graph planner");
    expect(state.tasks[0].status).toBe("running");
    expect(state.tasks[0].steps).toHaveLength(1);
    expect(state.tasks[0].steps[0].toolCalls).toHaveLength(1);
    expect(state.tasks[0].steps[0].toolCalls[0].name).toBe("search_nodes");
  });

  it("accumulates multiple graph planner tool calls on the same step", () => {
    const messages = [
      makeMessage("tool_call_update", {
        node_id: "graph_planner",
        tool_call_id: "tc-1",
        name: "search_nodes",
        args: { query: "text" }
      }),
      makeMessage("tool_call_update", {
        node_id: "graph_planner",
        tool_call_id: "tc-2",
        name: "add_node",
        args: { node_type: "nodetool.text.Join" }
      })
    ];
    const state = buildExecutionTreeState(messages);

    expect(state.tasks[0].steps[0].toolCalls).toHaveLength(2);
    expect(state.tasks[0].steps[0].toolCalls[0].name).toBe("search_nodes");
    expect(state.tasks[0].steps[0].toolCalls[1].name).toBe("add_node");
    expect(state.tasks[0].steps[0].toolName).toBe("add_node");
  });

  it("updates an existing graph planner tool call by id", () => {
    const messages = [
      makeMessage("tool_call_update", {
        node_id: "graph_planner",
        tool_call_id: "tc-1",
        name: "search_nodes",
        args: { query: "original" }
      }),
      makeMessage("tool_call_update", {
        node_id: "graph_planner",
        tool_call_id: "tc-1",
        name: "search_nodes",
        args: { query: "updated" },
        message: "Found results"
      })
    ];
    const state = buildExecutionTreeState(messages);

    expect(state.tasks[0].steps[0].toolCalls).toHaveLength(1);
    expect(state.tasks[0].steps[0].toolCalls[0].args).toEqual({
      query: "updated"
    });
  });

  it("marks graph planner task completed on planning_update phase=complete", () => {
    const messages = [
      makeMessage("tool_call_update", {
        node_id: "graph_planner",
        tool_call_id: "tc-1",
        name: "add_node",
        args: { type: "image" }
      }),
      makeMessage("planning_update", {
        phase: "complete",
        status: "Done",
        content: "Graph built successfully"
      })
    ];
    const state = buildExecutionTreeState(messages);

    expect(state.tasks[0].status).toBe("completed");
    expect(state.tasks[0].steps[0].status).toBe("completed");
    expect(state.tasks[0].steps[0].output).toBe("Graph built successfully");
  });

  it("marks graph planner task failed on planning_update phase=complete status=Failed", () => {
    const messages = [
      makeMessage("tool_call_update", {
        node_id: "graph_planner",
        tool_call_id: "tc-1",
        name: "search_nodes",
        args: {}
      }),
      makeMessage("planning_update", {
        phase: "complete",
        status: "Failed",
        content: "Could not build graph"
      })
    ];
    const state = buildExecutionTreeState(messages);

    expect(state.tasks[0].status).toBe("failed");
    expect(state.tasks[0].steps[0].status).toBe("failed");
    expect(state.phase).toBe("done");
  });
});

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
      {
        role: "agent_execution",
        execution_event_type: undefined,
        content: JSON.stringify(JSON.stringify(inner))
      } as unknown as Message
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
