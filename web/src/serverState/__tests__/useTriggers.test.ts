import { renderHook } from "@testing-library/react";
import { asMock, stub } from "../../test-utils/doubles";
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
      triggerStop: { mutate: jest.fn() },
      triggersRunning: { query: jest.fn() }
    },
    triggers: {
      listByWorkflow: { query: jest.fn() },
      fire: { mutate: jest.fn() }
    }
  }
}));

const mockAddNotification = jest.fn();
jest.mock("../../stores/NotificationStore", () => ({
  __esModule: true,
  useNotificationStore: <T,>(selector: (s: unknown) => T) =>
    selector({ addNotification: mockAddNotification })
}));

// Default: no VITE_API_URL, i.e. local dev behind the Vite proxy.
jest.mock("../../stores/BASE_URL", () => ({
  __esModule: true,
  BASE_URL: "",
  withApiBase: (url: string) => url
}));

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpcClient } from "../../trpc/client";
import {
  useWorkflowTriggers,
  useRunningTriggers,
  useSetTriggerEnabled,
  useFireTrigger,
  webhookDeliveryUrl,
  runningTriggersQueryKey,
  triggerErrorMessage
} from "../useTriggers";
import type {
  TriggerRegistrationStatus,
  RunningTriggerRegistration
} from "../useTriggers";

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockUseMutation = useMutation as jest.MockedFunction<typeof useMutation>;
const mockUseQueryClient = useQueryClient as jest.MockedFunction<
  typeof useQueryClient
>;

interface MutationConfig<TVars> {
  /** The tests await the call and assert on the trpc mock; the resolved
   *  value is never read. */
  mutationFn: (vars: TVars) => Promise<void>;
  onSuccess: () => void;
  onError: (error: unknown, variables: TVars) => void;
}

const mutationConfig = <TVars,>(): MutationConfig<TVars> =>
  asMock(useMutation).mock.calls[0][0];

describe("triggersQueryKey", () => {
  it("is hierarchical and scoped to the workflow", () => {
    expect(triggersQueryKey("wf-1")).toEqual(["triggers", "wf-1"]);
  });

  it("keeps the cross-workflow running list off any workflow id", () => {
    expect(runningTriggersQueryKey).toEqual(["triggers", "by-user", "running"]);
  });
});

describe("useWorkflowTriggers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue(stub<ReturnType<typeof useQuery>>({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null
    }));
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
    const queryFn: () => Promise<TriggerRegistrationStatus[]> =
      asMock(useQuery).mock.calls[0][0].queryFn;
    const result = await queryFn();
    expect(trpcClient.triggers.listByWorkflow.query).toHaveBeenCalledWith({
      workflowId: "wf-1"
    });
    expect(result).toEqual(triggers);
  });
});

describe("useRunningTriggers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue(stub<ReturnType<typeof useQuery>>({
      data: undefined,
      isLoading: false,
      isError: false
    }));
  });

  it("uses one shared key so a list of cards makes a single request", () => {
    renderHook(() => useRunningTriggers());
    renderHook(() => useRunningTriggers());
    for (const call of mockUseQuery.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({ queryKey: runningTriggersQueryKey })
      );
    }
  });

  it("returns the caller's enabled registrations across all workflows", async () => {
    const triggers = [
      {
        id: "reg-1",
        workflow_id: "wf-1",
        node_id: "n1",
        kind: "schedule",
        enabled: true,
        last_fired_at: null,
        last_error: null
      }
    ];
    (trpcClient.jobs.triggersRunning.query as jest.Mock).mockResolvedValue({
      triggers
    });
    renderHook(() => useRunningTriggers());
    const queryFn: () => Promise<RunningTriggerRegistration[]> =
      asMock(useQuery).mock.calls[0][0].queryFn;
    expect(await queryFn()).toEqual(triggers);
  });
});

describe("useSetTriggerEnabled", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls triggerStart when enabling", () => {
    renderHook(() => useSetTriggerEnabled("wf-1"));
    mutationConfig<{ id: string; enabled: boolean }>().mutationFn({
      id: "reg-1",
      enabled: true
    });
    expect(trpcClient.jobs.triggerStart.mutate).toHaveBeenCalledWith({
      id: "reg-1"
    });
    expect(trpcClient.jobs.triggerStop.mutate).not.toHaveBeenCalled();
  });

  it("calls triggerStop when disabling", () => {
    renderHook(() => useSetTriggerEnabled("wf-1"));
    mutationConfig<{ id: string; enabled: boolean }>().mutationFn({
      id: "reg-1",
      enabled: false
    });
    expect(trpcClient.jobs.triggerStop.mutate).toHaveBeenCalledWith({
      id: "reg-1"
    });
    expect(trpcClient.jobs.triggerStart.mutate).not.toHaveBeenCalled();
  });

  it("invalidates the workflow's triggers query and the running list on success", () => {
    const invalidateQueries = jest.fn();
    mockUseQueryClient.mockReturnValue(stub<ReturnType<typeof useQueryClient>>({
      invalidateQueries
    }));
    renderHook(() => useSetTriggerEnabled("wf-1"));
    mutationConfig().onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: triggersQueryKey("wf-1")
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: runningTriggersQueryKey
    });
  });

  it("notifies the user when arming a registration is rejected", () => {
    mockUseQueryClient.mockReturnValue(stub<ReturnType<typeof useQueryClient>>({
      invalidateQueries: jest.fn()
    }));
    renderHook(() => useSetTriggerEnabled("wf-1"));
    mutationConfig<{ id: string; enabled: boolean }>().onError(
      new Error("Trigger registration not found"),
      { id: "reg-1", enabled: true }
    );
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        content: expect.stringContaining("Could not activate trigger")
      })
    );
    expect(mockAddNotification.mock.calls[0][0].content).toContain(
      "Trigger registration not found"
    );
  });

  it("says 'deactivate' when the failing call was a disable", () => {
    mockUseQueryClient.mockReturnValue(stub<ReturnType<typeof useQueryClient>>({
      invalidateQueries: jest.fn()
    }));
    renderHook(() => useSetTriggerEnabled("wf-1"));
    mutationConfig<{ id: string; enabled: boolean }>().onError(
      new Error("forbidden"),
      { id: "reg-1", enabled: false }
    );
    expect(mockAddNotification.mock.calls[0][0].content).toContain(
      "Could not deactivate trigger"
    );
  });

  it("refetches after a failure so the UI does not show a state the server rejected", () => {
    const invalidateQueries = jest.fn();
    mockUseQueryClient.mockReturnValue(stub<ReturnType<typeof useQueryClient>>({
      invalidateQueries
    }));
    renderHook(() => useSetTriggerEnabled("wf-1"));
    mutationConfig<{ id: string; enabled: boolean }>().onError(new Error("x"), {
      id: "reg-1",
      enabled: true
    });
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
    mutationConfig<{ registrationId: string; payload?: unknown }>().mutationFn({
      registrationId: "reg-1",
      payload: { hello: 1 }
    });
    expect(trpcClient.triggers.fire.mutate).toHaveBeenCalledWith({
      registrationId: "reg-1",
      payload: { hello: 1 }
    });
  });

  it("surfaces the dispatcher-disabled error instead of failing silently", () => {
    renderHook(() => useFireTrigger("wf-1"));
    mutationConfig<{ registrationId: string }>().onError(
      new Error("trigger dispatcher not started"),
      { registrationId: "reg-1" }
    );
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        content:
          "Could not fire trigger: trigger dispatcher not started"
      })
    );
  });
});

describe("triggerErrorMessage", () => {
  it("reads an Error message, a bare string, and falls back otherwise", () => {
    expect(triggerErrorMessage(new Error("boom"))).toBe("boom");
    expect(triggerErrorMessage("boom")).toBe("boom");
    expect(triggerErrorMessage(null)).toBe("Unknown error");
  });
});

describe("webhookDeliveryUrl", () => {
  afterEach(() => {
    jest.resetModules();
  });

  it("falls back to the page origin when BASE_URL is empty (Vite proxy dev)", () => {
    expect(webhookDeliveryUrl("tok-1")).toBe(
      `${window.location.origin}/api/webhooks/tok-1`
    );
  });

  it("uses the configured API base on desktop and hosted builds", () => {
    jest.resetModules();
    jest.doMock("../../stores/BASE_URL", () => ({
      __esModule: true,
      BASE_URL: "https://api.nodetool.ai",
      withApiBase: (url: string) => `https://api.nodetool.ai${url}`
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../useTriggers") as typeof import("../useTriggers");
    expect(mod.webhookDeliveryUrl("tok-1")).toBe(
      "https://api.nodetool.ai/api/webhooks/tok-1"
    );
  });
});
