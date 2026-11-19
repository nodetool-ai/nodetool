/**
 * The Cloud and Shared with me groups of the desktop app (WP1.15). The
 * cloud client is a fake that answers like the cloud server's procedures.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

import { cloudOriginOf } from "../../lib/cloud/cloudAccount";
import { useCloudDocumentGroups, CLOUD_LIST_PAGE_SIZE } from "../useCloudDocumentGroups";
import type { CloudAccountState } from "../../window";

const ORIGIN = { kind: "cloud", server: "https://api.nodetool.ai", account: "u1" } as const;

let mockOrigin: typeof ORIGIN | null = ORIGIN;
const mockClient = {
  workflows: {
    list: { query: jest.fn() },
    sharing: { sharedWithMe: { query: jest.fn() } }
  },
  timeline: { list: { query: jest.fn() } },
  documentSharing: { sharedWithMe: { query: jest.fn() } }
};

jest.mock("../../trpc/cloudClient", () => ({ createCloudTrpcClient: jest.fn() }));
jest.mock("../../lib/cloud/cloudAccount", () => ({
  ...jest.requireActual("../../lib/cloud/cloudAccount"),
  useCloudOrigin: () => mockOrigin,
  cloudTrpcClient: () => mockClient
}));

function setup() {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => useCloudDocumentGroups(), { wrapper }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOrigin = ORIGIN;
  mockClient.workflows.list.query.mockImplementation(async (input: { cursor?: string }) =>
    input.cursor === "page-2"
      ? { workflows: [{ id: "wf-old", name: "", updated_at: "2026-01-01T00:00:00Z" }], next: null }
      : { workflows: [{ id: "wf-new", name: "Launch", updated_at: "2026-03-01T00:00:00Z" }], next: "page-2" }
  );
  mockClient.timeline.list.query.mockResolvedValue([
    { id: "tl-1", projectId: "p", name: "Cut", updatedAt: "2026-02-01T00:00:00Z" }
  ]);
  mockClient.workflows.sharing.sharedWithMe.query.mockResolvedValue({
    workflows: [{ id: "wf-s", name: "Their Flow", updated_at: "2026-02-02T00:00:00Z", shared_role: "editor" }]
  });
  mockClient.documentSharing.sharedWithMe.query.mockResolvedValue({
    documents: [
      { type: "timeline", id: "tl-s", name: "Their Cut", owner_id: "u2", role: "viewer", updated_at: "2026-02-03T00:00:00Z" },
      { type: "sketch", id: "sk-s", name: "Their Sketch", owner_id: "u2", role: "editor" }
    ]
  });
});

test("lists own workflows over every page and own timelines, newest first, with their origin", async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.groups).toHaveLength(2));
  const [own, shared] = result.current.groups;
  expect(own.id).toBe("cloud");
  expect(own.children.map((leaf) => [leaf.id, leaf.name, leaf.type])).toEqual([
    ["wf-new", "Launch", "workflow"],
    ["tl-1", "Cut", "timeline"],
    ["wf-old", "Untitled workflow", "workflow"]
  ]);
  expect(own.children.every((leaf) => leaf.origin === ORIGIN && !leaf.sharedRole)).toBe(true);
  expect(mockClient.workflows.list.query).toHaveBeenCalledWith(
    { limit: CLOUD_LIST_PAGE_SIZE },
    expect.anything()
  );
  expect(mockClient.workflows.list.query).toHaveBeenCalledWith(
    { limit: CLOUD_LIST_PAGE_SIZE, cursor: "page-2" },
    expect.anything()
  );

  // D26: a shared sketch does not open in the desktop app, so it is not listed.
  expect(shared.id).toBe("cloudShared");
  expect(shared.children.map((leaf) => [leaf.id, leaf.type, leaf.sharedRole])).toEqual([
    ["tl-s", "timeline", "viewer"],
    ["wf-s", "workflow", "editor"]
  ]);
});

test("TC124: the cache keys start with the server and the account", async () => {
  const { result, queryClient } = setup();
  await waitFor(() => expect(result.current.groups).toHaveLength(2));
  const keys = queryClient.getQueryCache().getAll().map((query) => query.queryKey);
  expect(keys).toHaveLength(2);
  for (const key of keys) {
    expect(key.slice(0, 3)).toEqual(["cloud", ORIGIN.server, ORIGIN.account]);
  }
});

test("signed out: no group and no request", async () => {
  mockOrigin = null;
  const { result } = setup();
  expect(result.current).toEqual({ groups: [], error: null });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(mockClient.workflows.list.query).not.toHaveBeenCalled();
  expect(mockClient.documentSharing.sharedWithMe.query).not.toHaveBeenCalled();
});

test("a failed list is reported, and the other group still shows", async () => {
  mockClient.timeline.list.query.mockRejectedValue(new Error("NodeTool Cloud could not be reached."));
  const { result } = setup();
  await waitFor(() => expect(result.current.error?.message).toBe("NodeTool Cloud could not be reached."));
  expect(result.current.groups.map((group) => group.id)).toEqual(["cloudShared"]);
});

describe("cloudOriginOf", () => {
  const signedIn: CloudAccountState = {
    available: true,
    state: "signedIn",
    displayName: "Ada",
    accountId: "u1",
    serverOrigin: "https://api.nodetool.ai",
    serverEndPending: false,
    cloudAvailable: true,
    keychainAvailable: true,
    message: ""
  };

  test("names the server and the account when signed in", () => {
    expect(cloudOriginOf(signedIn)).toEqual(ORIGIN);
  });

  test("is null signed out, with the policy off, or without an account id", () => {
    expect(cloudOriginOf(null)).toBeNull();
    expect(cloudOriginOf({ ...signedIn, state: "signedOut" })).toBeNull();
    expect(cloudOriginOf({ ...signedIn, cloudAvailable: false })).toBeNull();
    expect(cloudOriginOf({ ...signedIn, available: false })).toBeNull();
    expect(cloudOriginOf({ ...signedIn, accountId: "" })).toBeNull();
  });
});
