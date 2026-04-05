/**
 * Team Tools — Tools exposed to agents for inter-agent communication
 * and shared task board interaction.
 *
 * These tools are automatically added to every agent in a team,
 * giving them the ability to message teammates and manage tasks.
 */

import type { ProcessingContext } from "@nodetool/runtime";
import { Tool } from "../tools/base-tool.js";
import type { AgentIdentity, IMessageBus, ITaskBoard } from "./types.js";

// ─── Messaging Tools ───

export class SendMessageTool extends Tool {
  readonly name = "send_message";
  readonly description =
    "Send a message to a specific teammate. Use this to request help, share findings, or coordinate work.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      to: {
        type: "string",
        description: "Agent ID of the recipient"
      },
      subject: {
        type: "string",
        description: "Short topic of the message"
      },
      body: {
        type: "string",
        description: "Message content"
      },
      type: {
        type: "string",
        enum: ["request", "response", "info", "handoff"],
        description: "Message type (default: info)"
      },
      reply_to: {
        type: "string",
        description: "Message ID this is replying to (optional)"
      }
    },
    required: ["to", "subject", "body"]
  };

  constructor(
    private agentId: string,
    private bus: IMessageBus,
    private roster: AgentIdentity[]
  ) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const to = String(params.to);
    if (to !== "all" && !this.roster.find((a) => a.id === to)) {
      return {
        error: `Unknown agent: ${to}. Available: ${this.roster.map((a) => a.id).join(", ")}`
      };
    }
    const msg = this.bus.send({
      from: this.agentId,
      to,
      type:
        (params.type as "request" | "response" | "info" | "handoff") ?? "info",
      subject: String(params.subject),
      body: String(params.body),
      replyTo: params.reply_to ? String(params.reply_to) : undefined
    });
    return { status: "sent", messageId: msg.id };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Sending message to ${params.to}: ${params.subject}`;
  }
}

export class BroadcastTool extends Tool {
  readonly name = "broadcast";
  readonly description =
    "Send a message to all teammates at once. Use for announcements or sharing results with the whole team.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      subject: {
        type: "string",
        description: "Short topic of the broadcast"
      },
      body: {
        type: "string",
        description: "Message content"
      }
    },
    required: ["subject", "body"]
  };

  constructor(
    private agentId: string,
    private bus: IMessageBus
  ) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const msg = this.bus.send({
      from: this.agentId,
      to: "all",
      type: "info",
      subject: String(params.subject),
      body: String(params.body)
    });
    return { status: "broadcast_sent", messageId: msg.id };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Broadcasting to team: ${params.subject}`;
  }
}

export class CheckMessagesTool extends Tool {
  readonly name = "check_messages";
  readonly description =
    "Check your inbox for messages from teammates. Returns and clears pending messages.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {},
    required: []
  };

  constructor(
    private agentId: string,
    private bus: IMessageBus
  ) {
    super();
  }

  async process(): Promise<unknown> {
    const messages = this.bus.receive(this.agentId);
    if (messages.length === 0) {
      return { messages: [], note: "No new messages" };
    }
    return {
      messages: messages.map((m) => ({
        id: m.id,
        from: m.from,
        type: m.type,
        subject: m.subject,
        body: m.body,
        taskId: m.taskId,
        timestamp: m.timestamp
      }))
    };
  }

  userMessage(): string {
    return "Checking messages";
  }
}

// ─── Task Board Tools ───

export class CreateTaskTool extends Tool {
  readonly name = "create_task";
  readonly description =
    "Create a new task on the shared board for any teammate to claim. Use to delegate or decompose work.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Short task title" },
      description: {
        type: "string",
        description: "Detailed description of what needs to be done"
      },
      required_skills: {
        type: "array",
        items: { type: "string" },
        description: "Skill tags needed (matches agent skills)"
      },
      priority: {
        type: "number",
        description: "Priority 0-9 (0=highest, default=5)"
      },
      depends_on: {
        type: "array",
        items: { type: "string" },
        description: "Task IDs that must complete first"
      }
    },
    required: ["title", "description"]
  };

  constructor(
    private agentId: string,
    private board: ITaskBoard
  ) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    try {
      const task = this.board.create({
        title: String(params.title),
        description: String(params.description),
        createdBy: this.agentId,
        requiredSkills: (params.required_skills as string[]) ?? [],
        priority: typeof params.priority === "number" ? params.priority : 5,
        dependsOn: (params.depends_on as string[]) ?? []
      });
      return { status: "created", taskId: task.id, title: task.title };
    } catch (e) {
      return { error: String(e) };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Creating task: ${params.title}`;
  }
}

export class ListTasksTool extends Tool {
  readonly name = "list_tasks";
  readonly description =
    "View the shared task board. Shows all tasks and their status. Optionally filter to only tasks you can claim.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      available_only: {
        type: "boolean",
        description:
          "If true, only show tasks you can claim (open, dependencies met, skills match)"
      }
    },
    required: []
  };

  constructor(
    private agent: AgentIdentity,
    private board: ITaskBoard
  ) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const tasks = params.available_only
      ? this.board.getAvailable(this.agent)
      : this.board.getSnapshot();

    return {
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        claimedBy: t.claimedBy,
        priority: t.priority,
        requiredSkills: t.requiredSkills,
        dependsOn: t.dependsOn,
        parentTaskId: t.parentTaskId
      }))
    };
  }

  userMessage(): string {
    return "Listing tasks on the board";
  }
}

export class ClaimTaskTool extends Tool {
  readonly name = "claim_task";
  readonly description =
    "Claim an open task from the board to work on. Only succeeds if the task is available.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      task_id: { type: "string", description: "ID of the task to claim" }
    },
    required: ["task_id"]
  };

  constructor(
    private agentId: string,
    private board: ITaskBoard
  ) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const taskId = String(params.task_id);
    const success = this.board.claim(taskId, this.agentId);
    if (success) {
      this.board.startWork(taskId, this.agentId);
      const task = this.board.get(taskId);
      return {
        status: "claimed_and_working",
        task: task
          ? { id: task.id, title: task.title, description: task.description }
          : undefined
      };
    }
    return {
      error:
        "Could not claim task. It may already be claimed, not open, or dependencies are not met."
    };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Claiming task ${params.task_id}`;
  }
}

export class CompleteTaskTool extends Tool {
  readonly name = "complete_task";
  readonly description =
    "Mark a task as done with a result. Use when you've finished the work on a claimed task.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      task_id: { type: "string", description: "ID of the task to complete" },
      result: {
        description: "The output/result of the completed task"
      }
    },
    required: ["task_id", "result"]
  };

  constructor(private board: ITaskBoard) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const success = this.board.complete(String(params.task_id), {
      result: params.result
    });
    if (success) {
      this.board.resolveParents();
      return { status: "completed" };
    }
    return { error: "Could not complete task. Is it claimed/working by you?" };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Completing task ${params.task_id}`;
  }
}

export class FailTaskTool extends Tool {
  readonly name = "fail_task";
  readonly description =
    "Mark a task as failed with a reason. Use when you cannot complete the work.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      task_id: {
        type: "string",
        description: "ID of the task to mark as failed"
      },
      reason: { type: "string", description: "Why the task failed" }
    },
    required: ["task_id", "reason"]
  };

  constructor(private board: ITaskBoard) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const success = this.board.fail(
      String(params.task_id),
      String(params.reason)
    );
    return success
      ? { status: "marked_failed" }
      : { error: "Could not mark task as failed" };
  }

  userMessage(params: Record<string, unknown>): string {
    return `Marking task ${params.task_id} as failed`;
  }
}

export class DecomposeTaskTool extends Tool {
  readonly name = "decompose_task";
  readonly description =
    "Break a task into smaller subtasks. The parent task is blocked until all subtasks complete.";
  readonly inputSchema = {
    type: "object" as const,
    properties: {
      task_id: { type: "string", description: "Parent task ID to decompose" },
      subtasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            required_skills: {
              type: "array",
              items: { type: "string" }
            },
            priority: { type: "number" }
          },
          required: ["title", "description"]
        },
        description: "List of subtasks to create"
      }
    },
    required: ["task_id", "subtasks"]
  };

  constructor(
    private agentId: string,
    private board: ITaskBoard
  ) {
    super();
  }

  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    try {
      const subtaskDefs = (
        params.subtasks as Array<Record<string, unknown>>
      ).map((s) => ({
        title: String(s.title),
        description: String(s.description),
        createdBy: this.agentId,
        requiredSkills: (s.required_skills as string[]) ?? [],
        priority: typeof s.priority === "number" ? s.priority : 5
      }));

      const created = this.board.decompose(String(params.task_id), subtaskDefs);

      return {
        status: "decomposed",
        subtasks: created.map((t) => ({ id: t.id, title: t.title }))
      };
    } catch (e) {
      return { error: String(e) };
    }
  }

  userMessage(params: Record<string, unknown>): string {
    return `Decomposing task ${params.task_id}`;
  }
}

// ─── Helper: create all team tools for an agent ───

export function createTeamTools(
  agent: AgentIdentity,
  roster: AgentIdentity[],
  bus: IMessageBus,
  board: ITaskBoard
): Tool[] {
  return [
    new SendMessageTool(agent.id, bus, roster),
    new BroadcastTool(agent.id, bus),
    new CheckMessagesTool(agent.id, bus),
    new CreateTaskTool(agent.id, board),
    new ListTasksTool(agent, board),
    new ClaimTaskTool(agent.id, board),
    new CompleteTaskTool(board),
    new FailTaskTool(board),
    new DecomposeTaskTool(agent.id, board)
  ];
}
