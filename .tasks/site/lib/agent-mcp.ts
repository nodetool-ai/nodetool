// SDK MCP server exposing repo mutations the agent can call mid-run.
// Bound to a specific task ID — the agent never sees other tasks.
//
// Tool names appear to the model as `mcp__nodetool_tasks__<name>`.
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import * as repo from "./repo";

export function createTaskMcpServer(taskId: string, author: string) {
  const findCriterion = (needle: string) => {
    const task = repo.getTask(taskId);
    if (!task) return null;
    const byId = task.criteria.find((c) => String(c.id) === needle);
    if (byId) return byId;
    const lowered = needle.toLowerCase();
    return (
      task.criteria.find((c) => c.text.toLowerCase() === lowered) ??
      task.criteria.find((c) => c.text.toLowerCase().includes(lowered)) ??
      null
    );
  };

  return createSdkMcpServer({
    name: "nodetool_tasks",
    version: "1.0.0",
    tools: [
      tool(
        "add_note",
        "Append a note to your current task. Use this whenever you make a non-obvious decision the next person should know about.",
        { body: z.string().min(1) },
        async ({ body }) => {
          repo.addNote(taskId, author, body);
          return { content: [{ type: "text", text: "Note added." }] };
        }
      ),
      tool(
        "check_criterion",
        "Mark an acceptance criterion done. Match by numeric id or by a substring of the criterion text.",
        { criterion: z.string().min(1) },
        async ({ criterion }) => {
          const target = findCriterion(criterion);
          if (!target) {
            return { content: [{ type: "text", text: `No criterion matching "${criterion}".` }] };
          }
          repo.updateCriterion(target.id, { done: true });
          return { content: [{ type: "text", text: `Checked: ${target.text}` }] };
        }
      ),
      tool(
        "uncheck_criterion",
        "Mark an acceptance criterion as not-done.",
        { criterion: z.string().min(1) },
        async ({ criterion }) => {
          const target = findCriterion(criterion);
          if (!target) {
            return { content: [{ type: "text", text: `No criterion matching "${criterion}".` }] };
          }
          repo.updateCriterion(target.id, { done: false });
          return { content: [{ type: "text", text: `Unchecked: ${target.text}` }] };
        }
      ),
      tool(
        "add_criterion",
        "Add a new acceptance criterion to your current task.",
        { text: z.string().min(1) },
        async ({ text }) => {
          repo.addCriterion(taskId, text);
          return { content: [{ type: "text", text: `Added: ${text}` }] };
        }
      ),
      tool(
        "list_criteria",
        "List the acceptance criteria on your current task with their current state.",
        {},
        async () => {
          const task = repo.getTask(taskId);
          if (!task) return { content: [{ type: "text", text: "Task not found." }] };
          if (task.criteria.length === 0) {
            return { content: [{ type: "text", text: "No criteria." }] };
          }
          const text = task.criteria
            .map((c) => `${c.id}. [${c.done ? "x" : " "}] ${c.text}`)
            .join("\n");
          return { content: [{ type: "text", text }] };
        }
      ),
    ],
  });
}
