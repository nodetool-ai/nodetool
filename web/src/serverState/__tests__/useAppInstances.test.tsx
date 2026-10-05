import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import { restFetch } from "../../lib/rest-fetch";
import {
  appInstanceKeys,
  useAppInstances,
  useAppInstanceMutations
} from "../useAppInstances";
import { loadAppInstance } from "../../components/appbuilder/runtime/appInstanceApi";

let account = "owner";
let visitor: string | null = null;
jest.mock("../../stores/useAuth", () => ({
  useAuth: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: account } })
}));
jest.mock("../../lib/runtimeConfig", () => ({ isAuthRequired: () => true }));
jest.mock("../../lib/appSession", () => ({
  getAppSessionToken: () => visitor
}));
jest.mock("../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));
const fetchMock = jest.mocked(restFetch);
const metadata = {
  id: "a".repeat(32),
  user_id: "owner",
  application_id: "app",
  source_id: "application:app",
  name: "Spring sale",
  version: 1,
  revision: 4,
  is_default: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z"
};
const instance = {
  ...metadata,
  snapshot: {
    document: createEmptyDocument(),
    workflow_graphs: {},
    script_documents: {}
  },
  variables: { price: 10 }
};
const respond = (body: unknown, status = 200) =>
  fetchMock.mockResolvedValueOnce({
    ok: status === 200,
    status,
    json: async () => body
  } as Response);
const mount = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
};

describe("instance management query boundary", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    account = "owner";
    visitor = null;
  });

  it("preserves the loaded instance metadata needed by management", async () => {
    respond(instance);
    expect(await loadAppInstance(instance.id)).toEqual(instance);
  });

  it("follows metadata cursors and isolates account caches", async () => {
    respond({ instances: [metadata], next_cursor: "next-page" });
    respond({
      instances: [{ ...metadata, id: "b".repeat(32) }],
      next_cursor: null
    });
    const { wrapper } = mount();
    const hook = renderHook(() => useAppInstances({ application_id: "app" }), {
      wrapper
    });
    await waitFor(() =>
      expect(hook.result.current.data?.pages).toHaveLength(1)
    );
    await act(async () => {
      await hook.result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(hook.result.current.data?.pages).toHaveLength(2)
    );
    expect(fetchMock.mock.calls[1][0]).toContain("cursor=next-page");
    expect(
      appInstanceKeys.list("other", { application_id: "app" })
    ).not.toEqual(appInstanceKeys.list("owner", { application_id: "app" }));
  });

  it("sends revision-aware rename and invalidates only the matching scope", async () => {
    respond({ ...instance, name: "Renamed", revision: 5 });
    const { client, wrapper } = mount();
    const otherKey = appInstanceKeys.list("owner", { application_id: "other" });
    client.setQueryData(otherKey, { pages: [], pageParams: [] });
    const hook = renderHook(
      () => useAppInstanceMutations({ application_id: "app" }),
      { wrapper }
    );
    await act(async () => {
      await hook.result.current.rename.mutateAsync({
        id: instance.id,
        expected_revision: 4,
        name: "Renamed"
      });
    });
    expect(fetchMock.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ expected_revision: 4, name: "Renamed" })
    );
    expect(
      client.getQueryData(appInstanceKeys.detail("owner", instance.id))
    ).toEqual({ ...instance, name: "Renamed", revision: 5 });
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
  });

  it("keeps cached state intact on a revision conflict and never retries", async () => {
    respond({ detail: "conflict" }, 409);
    const { client, wrapper } = mount();
    client.setQueryData(appInstanceKeys.detail("owner", instance.id), instance);
    const hook = renderHook(
      () => useAppInstanceMutations({ application_id: "app" }),
      { wrapper }
    );
    await act(async () => {
      await expect(
        hook.result.current.rename.mutateAsync({
          id: instance.id,
          expected_revision: 3,
          name: "Conflict"
        })
      ).rejects.toThrow("another session");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      client.getQueryData(appInstanceKeys.detail("owner", instance.id))
    ).toEqual(instance);
  });

  it("does not list or mutate owner instances for visitor sessions", async () => {
    visitor = "visitor-token";
    const { wrapper } = mount();
    const hook = renderHook(
      () => ({
        list: useAppInstances({ application_id: "app" }),
        mutations: useAppInstanceMutations({ application_id: "app" })
      }),
      { wrapper }
    );
    await act(async () => {
      await expect(
        hook.result.current.mutations.remove.mutateAsync(instance.id)
      ).rejects.toThrow("owner session");
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
