import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("../../lib/rest-fetch", () => ({
  restFetch: jest.fn()
}));
jest.mock("../../trpc/client", () => ({
  trpcClient: {
    triggers: {
      fire: { mutate: jest.fn() }
    }
  }
}));

import { restFetch } from "../../lib/rest-fetch";
import { trpcClient } from "../../trpc/client";
import {
  useTriggerStatus,
  useSetTriggersActive,
  useFireTrigger,
  TriggerRegistrationSummary
} from "../useTriggers";

const mockRestFetch = restFetch as jest.MockedFunction<typeof restFetch>;
const mockFire = trpcClient.triggers.fire.mutate as jest.Mock;

const jsonResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body } as Response);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

const summary = (
  over: Partial<TriggerRegistrationSummary>
): TriggerRegistrationSummary => ({
  id: "reg-1",
  workflow_id: "wf-1",
  node_id: "node-1",
  kind: "webhook",
  enabled: true,
  last_fired_at: null,
  last_error: null,
  token: "tok-1",
  ...over
});

describe("useTriggerStatus", () => {
  beforeEach(() => jest.clearAllMocks());

  it("does not fetch when disabled (no trigger nodes)", () => {
    renderHook(() => useTriggerStatus("wf-1", false), {
      wrapper: createWrapper()
    });
    expect(mockRestFetch).not.toHaveBeenCalled();
  });

  it("filters registrations to the current workflow", async () => {
    mockRestFetch.mockResolvedValueOnce(
      jsonResponse({
        triggers: [
          summary({ id: "a", workflow_id: "wf-1" }),
          summary({ id: "b", workflow_id: "wf-2" })
        ]
      })
    );

    const { result } = renderHook(() => useTriggerStatus("wf-1", true), {
      wrapper: createWrapper()
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].id).toBe("a");
    expect(mockRestFetch).toHaveBeenCalledWith("/api/jobs/triggers/running");
  });

  it("surfaces a non-ok response as an error", async () => {
    mockRestFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({})
    } as Response);

    const { result } = renderHook(() => useTriggerStatus("wf-1", true), {
      wrapper: createWrapper()
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useSetTriggersActive", () => {
  beforeEach(() => jest.clearAllMocks());

  it("POSTs to the start endpoint when activating", async () => {
    mockRestFetch.mockResolvedValueOnce(jsonResponse({ triggers: [] }));

    const { result } = renderHook(() => useSetTriggersActive("wf-1"), {
      wrapper: createWrapper()
    });

    await result.current.mutateAsync(true);
    expect(mockRestFetch).toHaveBeenCalledWith(
      "/api/jobs/triggers/wf-1/start",
      { method: "POST" }
    );
  });

  it("POSTs to the stop endpoint when deactivating", async () => {
    mockRestFetch.mockResolvedValueOnce(jsonResponse({ triggers: [] }));

    const { result } = renderHook(() => useSetTriggersActive("wf-1"), {
      wrapper: createWrapper()
    });

    await result.current.mutateAsync(false);
    expect(mockRestFetch).toHaveBeenCalledWith("/api/jobs/triggers/wf-1/stop", {
      method: "POST"
    });
  });
});

describe("useFireTrigger", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls triggers.fire and returns the job id", async () => {
    mockFire.mockResolvedValueOnce({ job_id: "job-9" });

    const { result } = renderHook(() => useFireTrigger(), {
      wrapper: createWrapper()
    });

    const res = await result.current.mutateAsync("reg-1");
    expect(mockFire).toHaveBeenCalledWith({ registrationId: "reg-1" });
    expect(res.job_id).toBe("job-9");
  });
});
