/**
 * Every skill the session's user can load, published as an MCP prompt.
 *
 * MCP has no system prompt, so the skill catalog the chat turn carries never
 * reaches an MCP client, and a skill was only discoverable by writing an
 * `execute_code` action that imports `list_skills`. A prompt is the MCP shape
 * for "saved instructions the user picks": clients list them, and Claude Code
 * offers each one as a slash command.
 *
 * Shipped skills are registered synchronously, so they are there before the
 * client's first `prompts/list`. The user's own rows need the database, so they
 * arrive a moment later and the SDK announces them with `list_changed`. A body
 * is read when the prompt is requested, never cached, so an edited skill is
 * served as it is now. Resolution matches `load_skill`: the user's row first,
 * then the shipped skill.
 */

import type {
  McpServer,
  RegisteredPrompt
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { findSystemSkill, loadSystemSkills } from "@nodetool-ai/agents";
import { Skill } from "@nodetool-ai/models";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.websocket.mcp-skill-prompts");

const argsSchema = {
  request: z
    .string()
    .optional()
    .describe("What to do with this skill. Optional.")
};

async function resolveSkill(
  userId: string,
  name: string
): Promise<{ name: string; content: string } | null> {
  const row = await Skill.findByName(userId, name);
  if (row) return { name: row.name, content: row.content };
  const shipped = findSystemSkill(name);
  return shipped ? { name: shipped.name, content: shipped.content } : null;
}

function skillPromptText(
  name: string,
  content: string,
  request: string | undefined
): string {
  const lines = [
    `Follow the NodeTool skill "${name}" below. Act through the NodeTool MCP tools.`
  ];
  const task = request?.trim();
  if (task) lines.push("", `Request: ${task}`);
  lines.push("", content.trim());
  return lines.join("\n");
}

/**
 * Register one prompt per skill. Returns when the user's rows are registered;
 * the shipped skills are registered before it returns its promise.
 */
export function registerSkillPrompts(
  server: McpServer,
  userId: string,
  reservedNames: ReadonlySet<string>
): Promise<void> {
  const registered = new Map<string, RegisteredPrompt>();

  const register = (name: string, description: string): void => {
    if (reservedNames.has(name) || registered.has(name)) return;
    const prompt = server.registerPrompt(
      name,
      { description, argsSchema },
      async ({ request }): Promise<GetPromptResult> => {
        const skill = await resolveSkill(userId, name);
        if (!skill) throw new Error(`No skill named "${name}".`);
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: skillPromptText(skill.name, skill.content, request)
              }
            }
          ]
        };
      }
    );
    registered.set(name, prompt);
  };

  for (const skill of loadSystemSkills()) {
    register(skill.name, skill.description);
  }

  return Skill.listByUser(userId).then(
    (rows) => {
      for (const row of rows) {
        // A user row that holds a shipped name wins, as in `list_skills`.
        const shadowed = registered.get(row.name);
        if (shadowed) shadowed.update({ description: row.description });
        else register(row.name, row.description);
      }
    },
    (error: unknown) => {
      log.warn("Could not list the user's skills for MCP prompts", {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  );
}
