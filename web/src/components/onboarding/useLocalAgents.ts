/**
 * The coding agents installed on this machine that can reach NodeTool over
 * MCP: Claude Code, Codex and Antigravity.
 *
 * Reads `mcpConfig.status`, which reports for each agent whether it is
 * present (its binary or data directory) and whether its config already holds
 * the NodeTool entry. `connect` writes that entry through the same procedure
 * Settings → MCP uses, so both surfaces agree.
 *
 * The status procedure answers only on a server that runs on this machine. On
 * a hosted server it refuses, which reads as "no local agents" rather than an
 * error to show or retry.
 */

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { McpTarget } from "@nodetool-ai/protocol/api-schemas/mcp-config.js";
import { trpcClient } from "../../trpc/client";

/** The agents the home card offers, in display order. */
export const LOCAL_AGENT_TARGETS = ["claude", "codex", "antigravity"] as const;
export type LocalAgentTarget = (typeof LOCAL_AGENT_TARGETS)[number];

export interface LocalAgent {
  target: LocalAgentTarget;
  label: string;
  connected: boolean;
}

/** Shared with Settings → MCP, so a change on one surface refreshes the other. */
export const MCP_STATUS_QUERY_KEY = ["mcp-status"] as const;

const isLocalAgentTarget = (target: McpTarget): target is LocalAgentTarget =>
  (LOCAL_AGENT_TARGETS as readonly string[]).includes(target);

export interface UseLocalAgentsResult {
  /** Installed agents, connected or not. Empty until the status loads. */
  agents: LocalAgent[];
  /** Write the NodeTool entry for these agents. Resolves with the ones written. */
  connect: (targets: LocalAgentTarget[]) => Promise<LocalAgent[]>;
  connecting: boolean;
}

export const useLocalAgents = (): UseLocalAgentsResult => {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: MCP_STATUS_QUERY_KEY,
    queryFn: () => trpcClient.mcpConfig.status.query(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false
  });

  const agents = useMemo<LocalAgent[]>(() => {
    const byTarget = new Map(
      (data?.targets ?? []).map((status) => [status.target, status])
    );
    return LOCAL_AGENT_TARGETS.flatMap((target) => {
      const status = byTarget.get(target);
      if (!status || !status.present || !isLocalAgentTarget(status.target)) {
        return [];
      }
      return [{ target, label: status.label, connected: status.installed }];
    });
  }, [data]);

  const mutation = useMutation({
    mutationFn: (targets: LocalAgentTarget[]) =>
      trpcClient.mcpConfig.install.mutate({ targets }),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: MCP_STATUS_QUERY_KEY })
  });

  const { mutateAsync } = mutation;
  const connect = useMemo(
    () =>
      async (targets: LocalAgentTarget[]): Promise<LocalAgent[]> => {
        const { results } = await mutateAsync(targets);
        const failed = results.filter((result) => !result.success);
        if (failed.length > 0) {
          throw new Error(
            failed
              .map((result) =>
                result.success ? "" : `${result.label}: ${result.error}`
              )
              .join("\n")
          );
        }
        return results.flatMap((result) =>
          isLocalAgentTarget(result.target)
            ? [{ target: result.target, label: result.label, connected: true }]
            : []
        );
      },
    [mutateAsync]
  );

  return { agents, connect, connecting: mutation.isPending };
};
