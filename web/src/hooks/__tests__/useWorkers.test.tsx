/**
 * @jest-environment jsdom
 */
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    worker: {
      profiles: {
        list: { query: jest.fn() },
        create: { mutate: jest.fn() },
        delete: { mutate: jest.fn() }
      },
      instances: {
        list: { query: jest.fn() }
      },
      provision: { mutate: jest.fn() },
      stop: { mutate: jest.fn() },
      stopAll: { mutate: jest.fn() },
      attach: { mutate: jest.fn() },
      detach: { mutate: jest.fn() },
      reconcile: { mutate: jest.fn() }
    }
  }
}));

import { trpcClient } from "../../trpc/client";
import { useWorkers } from "../useWorkers";

const mockProfilesList = trpcClient.worker.profiles.list.query as jest.Mock;
const mockProfilesCreate = trpcClient.worker.profiles.create.mutate as jest.Mock;
const mockProfilesDelete = trpcClient.worker.profiles.delete.mutate as jest.Mock;
const mockInstancesList = trpcClient.worker.instances.list.query as jest.Mock;
const mockProvision = trpcClient.worker.provision.mutate as jest.Mock;
const mockStop = trpcClient.worker.stop.mutate as jest.Mock;
const mockAttach = trpcClient.worker.attach.mutate as jest.Mock;
const mockDetach = trpcClient.worker.detach.mutate as jest.Mock;

const makeProfile = (overrides: Record<string, unknown> = {}) => ({
  id: "p-1",
  name: "hf-a40",
  target: "runpod",
  image: "ghcr.io/nodetool/worker:0.7.3",
  spec: {},
  token_policy: "generate",
  idle_timeout_minutes: 15,
  max_lifetime_minutes: null,
  created_at: "2026-06-08T00:00:00Z",
  updated_at: "2026-06-08T00:00:00Z",
  ...overrides
});

const makeInstance = (overrides: Record<string, unknown> = {}) => ({
  id: "i-1",
  profile_name: "hf-a40",
  target: "runpod",
  provider_ref: "pod-abc",
  ws_url: "wss://pod-abc-7777.proxy.runpod.net",
  token: "tok",
  status: "running",
  attached_to: null,
  created_at: "2026-06-08T00:00:00Z",
  last_activity_at: "2026-06-08T00:00:00Z",
  estimated_cost_usd: 0.5,
  ...overrides
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } }
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useWorkers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfilesList.mockResolvedValue([makeProfile()]);
    mockInstancesList.mockResolvedValue([makeInstance()]);
  });

  it("loads profiles and instances via the worker tRPC procedures", async () => {
    const { result } = renderHook(() => useWorkers(), {
      wrapper: createWrapper()
    });

    await waitFor(() => {
      expect(result.current.profiles).toHaveLength(1);
      expect(result.current.instances).toHaveLength(1);
    });

    expect(result.current.profiles[0].name).toBe("hf-a40");
    expect(result.current.instances[0].id).toBe("i-1");
    expect(mockProfilesList).toHaveBeenCalledTimes(1);
    expect(mockInstancesList).toHaveBeenCalledTimes(1);
  });

  it("provision calls worker.provision with the profile name", async () => {
    mockProvision.mockResolvedValue(makeInstance({ id: "i-2" }));
    const { result } = renderHook(() => useWorkers(), {
      wrapper: createWrapper()
    });

    await waitFor(() => expect(result.current.instances).toHaveLength(1));

    await act(async () => {
      await result.current.provision("hf-a40");
    });

    expect(mockProvision).toHaveBeenCalledWith({ profileName: "hf-a40" });
  });

  it("stop calls worker.stop with the instance id", async () => {
    mockStop.mockResolvedValue(makeInstance({ status: "stopped" }));
    const { result } = renderHook(() => useWorkers(), {
      wrapper: createWrapper()
    });

    await waitFor(() => expect(result.current.instances).toHaveLength(1));

    await act(async () => {
      await result.current.stop("i-1");
    });

    expect(mockStop).toHaveBeenCalledWith({ id: "i-1" });
  });

  it("attach and detach call the matching procedures", async () => {
    mockAttach.mockResolvedValue({ wsUrl: "wss://x", token: "t" });
    mockDetach.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useWorkers(), {
      wrapper: createWrapper()
    });

    await waitFor(() => expect(result.current.instances).toHaveLength(1));

    await act(async () => {
      await result.current.attach("i-1");
    });
    expect(mockAttach).toHaveBeenCalledWith({ id: "i-1" });

    await act(async () => {
      await result.current.detach();
    });
    expect(mockDetach).toHaveBeenCalledTimes(1);
  });

  it("createProfile and deleteProfile call the profile procedures", async () => {
    mockProfilesCreate.mockResolvedValue(makeProfile({ name: "new" }));
    mockProfilesDelete.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useWorkers(), {
      wrapper: createWrapper()
    });

    await waitFor(() => expect(result.current.profiles).toHaveLength(1));

    const input = {
      name: "new",
      target: "runpod" as const,
      image: "img",
      token_policy: "generate" as const
    };
    await act(async () => {
      await result.current.createProfile(input);
    });
    expect(mockProfilesCreate).toHaveBeenCalledWith(input);

    await act(async () => {
      await result.current.deleteProfile("new");
    });
    expect(mockProfilesDelete).toHaveBeenCalledWith({ name: "new" });
  });

  it("exposes the attached instance via activeWorker", async () => {
    mockInstancesList.mockResolvedValue([
      makeInstance({ id: "i-1", status: "running", attached_to: null }),
      makeInstance({ id: "i-2", status: "attached", attached_to: "local" })
    ]);
    const { result } = renderHook(() => useWorkers(), {
      wrapper: createWrapper()
    });

    await waitFor(() => expect(result.current.instances).toHaveLength(2));
    expect(result.current.activeWorker?.id).toBe("i-2");
  });
});
