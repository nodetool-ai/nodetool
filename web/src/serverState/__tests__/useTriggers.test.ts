import { renderHook } from "@testing-library/react";
import { triggersQueryKey } from "../useTriggers";

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  useQuery: jest.fn(),
  useMutation: jest.fn(() => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false
  })),
  useQueryClient: jest.fn(() => ({
    invalidateQueries: jest.fn()
  }))
}));

jest.mock("../../trpc/client", () => ({
  __esModule: true,
  trpcClient: {
    jobs: {
      triggerStart: { mutate: jest.fn() },
      triggerStop: { mutate: jest.fn() }
    },
    triggers: {
      listByWorkflow: { query: jest.fn() },
      fire: { mutate: jest.fn() }
    }
  }
}));

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "../../trpc/client";
import {
  useWorkflowTriggers,
  useSetTriggerEnabled,
  useFireTrigger,
  webhookDeliveryUrl
} from "../useTriggers";

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockUseMutation = useMutation as jest.MockedFunction<typeof useMutation>;
const mockUseQueryClient = useQueryClient as jest.MockedFunction<
  typeof useQueryClient
>;

describe("triggersQueryKey", () => {
  it("is hierarchical and scoped to the workflow", () => {
    expect(triggersQueryKey("wf-1")).toEqual(["triggers", "wf-1"]);
  });
});

describe("useWorkflowTriggers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null
    } as unknown as ReturnType<typeof useQuery>);
  });

  it("disables the query when there is no workflow id", () => {
    renderHook(() => useWorkflowTriggers(null, { enabled: true }));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it("disables the query when the caller says the graph has no triggers", () => {
    renderHook(() => useWorkflowTriggers("wf-1", { enabled: false }));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it("enables the query and scopes it under ['triggers', workflowId]", () => {
    renderHook(() => useWorkflowTriggers("wf-1", { enabled: true }));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        queryKey: triggersQueryKey("wf-1")
      })
    );
  });

  it("queries triggers.listByWorkflow with the workflow id, including disabled rows", async () => {
    const triggers = [
      {
        id: "reg-1",
        workflow_id: "wf-1",
        node_id: "n1",
        kind: "webhook",
        enabled: false,
        last_fired_at: null,
        last_error: null,
        webhook_token: "tok-1",
        webhook_secret: "sec-1"
      }
    ];
    (trpcClient.triggers.listByWorkflow.query as jest.Mock).mockResolvedValue({
      triggers
    });

    renderHook(() => useWorkflowTriggers("wf-1"));
    const { queryFn } = mockUseQuery.mock.calls[0][0] as unknown as {
      queryFn: () => Promise<unknown>;
    };
    const result = await queryFn();
    expect(trpcClient.triggers.listByWorkflow.query).toHaveBeenCalledWith({
      workflowId: "wf-1"
    });
    expect(result).toEqual(triggers);
  });
});

describe("useSetTriggerEnabled", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls triggerStart when enabling", () => {
    renderHook(() => useSetTriggerEnabled("wf-1"));
    const { mutationFn } = mockUseMutation.mock.calls[0][0] as {
      mutationFn: (opts: { id: string; enabled: boolean }) => Promise<unknown>;
    };
    mutationFn({ id: "reg-1", enabled: true });
    expect(trpcClient.jobs.triggerStart.mutate).toHaveBeenCalledWith({
      id: "reg-1"
    });
    expect(trpcClient.jobs.triggerStop.mutate).not.toHaveBeenCalled();
  });

  it("calls triggerStop when disabling", () => {
    renderHook(() => useSetTriggerEnabled("wf-1"));
    const { mutationFn } = mockUseMutation.mock.calls[0][0] as {
      mutationFn: (opts: { id: string; enabled: boolean }) => Promise<unknown>;
    };
    mutationFn({ id: "reg-1", enabled: false });
    expect(trpcClient.jobs.triggerStop.mutate).toHaveBeenCalledWith({
      id: "reg-1"
    });
    expect(trpcClient.jobs.triggerStart.mutate).not.toHaveBeenCalled();
  });

  it("invalidates the workflow's triggers query on success", () => {
    const invalidateQueries = jest.fn();
    mockUseQueryClient.mockReturnValue({
      invalidateQueries
    } as unknown as ReturnType<typeof useQueryClient>);
    renderHook(() => useSetTriggerEnabled("wf-1"));
    const { onSuccess } = mockUseMutation.mock.calls[0][0] as {
      onSuccess: () => void;
    };
    onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: triggersQueryKey("wf-1")
    });
  });
});

describe("useFireTrigger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls triggers.fire with the registration id and payload", () => {
    renderHook(() => useFireTrigger("wf-1"));
    const { mutationFn } = mockUseMutation.mock.calls[0][0] as {
      mutationFn: (opts: {
        registrationId: string;
        payload?: unknown;
      }) => Promise<unknown>;
    };
    mutationFn({ registrationId: "reg-1", payload: { hello: 1 } });
    expect(trpcClient.triggers.fire.mutate).toHaveBeenCalledWith({
      registrationId: "reg-1",
      payload: { hello: 1 }
    });
  });
});

describe("webhookDeliveryUrl", () => {
  it("builds the POST /api/webhooks/:token URL from the current origin", () => {
    expect(webhookDeliveryUrl("tok-1")).toBe(
      `${window.location.origin}/api/webhooks/tok-1`
    );
  });
});
