import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ToolPermissionGroup,
  ToolPermissionRule
} from "@nodetool-ai/protocol/api-schemas/settings.js";
import { trpcClient } from "../trpc/client";

export const toolPermissionsQueryKey = ["settings", "tool-permissions"] as const;

interface ToolPermissionsData {
  groups: ToolPermissionGroup[];
}

interface SetRuleInput {
  name: string;
  rule: ToolPermissionRule;
}

function withRule(
  data: ToolPermissionsData,
  { name, rule }: SetRuleInput
): ToolPermissionsData {
  return {
    groups: data.groups.map((group) => ({
      ...group,
      tools: group.tools.map((tool) =>
        tool.name === name ? { ...tool, rule } : tool
      )
    }))
  };
}

export interface UseToolPermissionsResult {
  groups: ToolPermissionGroup[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  setRule: (input: SetRuleInput) => Promise<void>;
}

/**
 * The user's saved tool rules, grouped for Settings › Permissions. A rule
 * change shows at once and rolls back if the server refuses it.
 */
export function useToolPermissions({
  enabled = true
}: { enabled?: boolean } = {}): UseToolPermissionsResult {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: toolPermissionsQueryKey,
    enabled,
    queryFn: () => trpcClient.settings.toolPermissions.list.query(),
    // The chat card's "Always allow" writes the same rows, so a reopened
    // Settings tab should read them again rather than show a stale list.
    staleTime: 0
  });

  const mutation = useMutation({
    mutationFn: (input: SetRuleInput) =>
      trpcClient.settings.toolPermissions.set.mutate(input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: toolPermissionsQueryKey });
      const previous = queryClient.getQueryData<ToolPermissionsData>(
        toolPermissionsQueryKey
      );
      if (previous) {
        queryClient.setQueryData(
          toolPermissionsQueryKey,
          withRule(previous, input)
        );
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(toolPermissionsQueryKey, context.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(toolPermissionsQueryKey, data);
    }
  });

  return {
    groups: query.data?.groups ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void query.refetch();
    },
    setRule: async (input) => {
      await mutation.mutateAsync(input);
    }
  };
}
