/**
 * SubAgentPlanner -- Uses an LLM to auto-specialize sub-agents for a given
 * objective in multi-agent mode.
 *
 * Given an objective and a desired number of agents, it produces a list of
 * SubAgentConfig objects with specialized roles and skills.
 */

import { createLogger } from "@nodetool/config";
import type { BaseProvider, Message, ProviderTool } from "@nodetool/runtime";
import type {
  ProcessingMessage,
  LogUpdate,
  PlanningUpdate
} from "@nodetool/protocol";
import type { Tool } from "./tools/base-tool.js";
import type { SubAgentConfig } from "./types.js";
import { extractJSON } from "./utils/json-parser.js";

const log = createLogger("nodetool.agents.sub-agent-planner");

const MAX_RETRIES = 3;

const SYSTEM_PROMPT = `You are a team architect that designs specialized AI agent teams.

Given an objective, create a team of agents with complementary roles and skills.
Each agent should have:
- name: Short, descriptive name (e.g. "researcher", "writer", "analyst")
- role: Clear role description explaining what this agent does
- skills: Array of skill tags for task matching (e.g. ["web_search", "data_analysis"])

Requirements:
- The first agent should be a coordinator/lead who can decompose the objective
- Other agents should have distinct, non-overlapping specializations
- Skills should match the available tools
- Each agent should contribute uniquely to achieving the objective

Call the create_team tool with your team design.`;

const CREATE_TEAM_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    agents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short agent name" },
          role: { type: "string", description: "Role description" },
          skills: {
            type: "array",
            items: { type: "string" },
            description: "Skill tags for task matching"
          }
        },
        required: ["name", "role", "skills"]
      },
      description: "List of agent definitions"
    }
  },
  required: ["agents"]
};

export interface SubAgentPlannerOptions {
  provider: BaseProvider;
  model: string;
  tools?: Tool[];
}

export class SubAgentPlanner {
  private provider: BaseProvider;
  private model: string;
  private tools: Tool[];

  constructor(opts: SubAgentPlannerOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.tools = opts.tools ?? [];
  }

  /**
   * Generate sub-agent configs from an objective.
   * Yields PlanningUpdate messages during generation.
   * Returns the final SubAgentConfig array.
   */
  async *plan(
    objective: string,
    numAgents: number
  ): AsyncGenerator<ProcessingMessage, SubAgentConfig[]> {
    const toolNames = this.tools
      .map((t) => `${t.name}: ${t.description}`)
      .join("\n");

    const userPrompt = [
      `Design a team of exactly ${numAgents} specialized agents for this objective:`,
      "",
      `Objective: ${objective}`,
      "",
      "Available tools:",
      toolNames || "(no specific tools available)",
      "",
      "Call the create_team tool with your team design."
    ].join("\n");

    const messages: Message[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ];

    const providerTools: ProviderTool[] = [
      {
        name: "create_team",
        description: "Define the team of specialized agents",
        inputSchema: CREATE_TEAM_SCHEMA
      }
    ];

    yield {
      type: "planning_update",
      phase: "initialization",
      status: "started",
      content: `Designing team of ${numAgents} agents...`
    } satisfies PlanningUpdate;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      log.debug("Generating sub-agent team", {
        objective: objective.slice(0, 60),
        attempt: attempt + 1
      });

      yield {
        type: "planning_update",
        phase: "generation",
        status: "running",
        content:
          attempt > 0
            ? `Retry attempt ${attempt + 1}/${MAX_RETRIES}...`
            : "Generating team composition..."
      } satisfies PlanningUpdate;

      try {
        const response = await this.provider.generateMessageTraced({
          messages,
          model: this.model,
          tools: providerTools
        });

        // Extract team data from tool call or text response
        let teamData: Record<string, unknown> | null = null;

        if (response.toolCalls && response.toolCalls.length > 0) {
          const createTeamCall = response.toolCalls.find(
            (tc) => tc.name === "create_team"
          );
          if (createTeamCall) {
            teamData = createTeamCall.args as Record<string, unknown>;
          }
        }

        if (!teamData && response.content) {
          teamData = extractJSON(String(response.content)) as Record<
            string,
            unknown
          > | null;
        }

        if (!teamData || !Array.isArray(teamData.agents)) {
          log.warn("Failed to parse team data", { attempt: attempt + 1 });
          messages.push(
            { role: "assistant", content: String(response.content ?? "") },
            {
              role: "user",
              content:
                "The response was not valid. Please call the create_team tool with an 'agents' array."
            }
          );
          continue;
        }

        const agents = teamData.agents as Array<Record<string, unknown>>;
        const configs: SubAgentConfig[] = agents.map((agent) => ({
          name: String(agent.name ?? "agent"),
          role: String(agent.role ?? "general assistant"),
          skills: Array.isArray(agent.skills) ? agent.skills.map(String) : [],
          tools: Array.isArray(agent.tools)
            ? agent.tools.map(String)
            : undefined
        }));

        log.info("Sub-agent team planned", { count: configs.length });

        yield {
          type: "planning_update",
          phase: "complete",
          status: "completed",
          content: `Team of ${configs.length} agents designed: ${configs.map((c) => c.name).join(", ")}`
        } satisfies PlanningUpdate;

        return configs;
      } catch (err) {
        log.error("Sub-agent planning error", {
          attempt: attempt + 1,
          error: String(err)
        });
        messages.push({
          role: "user",
          content: `Error occurred: ${String(err)}. Please try again.`
        });
      }
    }

    // Fallback: generate generic agents
    log.warn("Falling back to generic sub-agent configs", { numAgents });

    yield {
      type: "log_update",
      node_id: "sub_agent_planner",
      node_name: "SubAgentPlanner",
      content: "Using fallback generic team composition",
      severity: "warning"
    } satisfies LogUpdate;

    return this.generateFallbackAgents(numAgents);
  }

  /**
   * Generate generic fallback agents when LLM planning fails.
   */
  private generateFallbackAgents(count: number): SubAgentConfig[] {
    const templates: SubAgentConfig[] = [
      {
        name: "coordinator",
        role: "Lead coordinator who decomposes the objective and delegates tasks",
        skills: ["planning", "coordination", "delegation"]
      },
      {
        name: "researcher",
        role: "Researches and gathers information relevant to the objective",
        skills: ["web_search", "data_gathering", "analysis"]
      },
      {
        name: "executor",
        role: "Executes specific tasks and produces deliverables",
        skills: ["execution", "writing", "implementation"]
      },
      {
        name: "reviewer",
        role: "Reviews work quality and suggests improvements",
        skills: ["review", "quality_assurance", "feedback"]
      }
    ];

    return templates.slice(0, Math.min(count, templates.length));
  }
}
