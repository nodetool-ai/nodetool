import { QueryClient } from "@tanstack/react-query";
import {
  WORKFLOW_LIST_KEY_PREFIX,
  workflowListQueryKey
} from "../workflowQueryKeys";

describe("workflowListQueryKey", () => {
  it("gives each fetch limit its own cache entry", () => {
    expect(workflowListQueryKey(100)).not.toEqual(workflowListQueryKey(1000));
  });

  it("is stable for the same limit and cursor", () => {
    expect(workflowListQueryKey(200)).toEqual(workflowListQueryKey(200, ""));
  });

  it("keeps the shared prefix so ['workflows'] invalidation still matches", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    const fetchSmall = jest.fn().mockResolvedValue({ workflows: [] });
    const fetchLarge = jest.fn().mockResolvedValue({ workflows: [] });

    await queryClient.fetchQuery({
      queryKey: workflowListQueryKey(100),
      queryFn: fetchSmall
    });
    await queryClient.fetchQuery({
      queryKey: workflowListQueryKey(1000),
      queryFn: fetchLarge
    });

    // Two separate entries, each populated by its own queryFn.
    expect(queryClient.getQueryCache().getAll()).toHaveLength(2);
    expect(fetchSmall).toHaveBeenCalledTimes(1);
    expect(fetchLarge).toHaveBeenCalledTimes(1);

    await queryClient.invalidateQueries({
      queryKey: [WORKFLOW_LIST_KEY_PREFIX]
    });

    for (const query of queryClient.getQueryCache().getAll()) {
      expect(query.state.isInvalidated || query.state.fetchStatus !== "idle").toBe(
        true
      );
    }

    queryClient.clear();
  });
});
