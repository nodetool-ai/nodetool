/**
 * Entity tagging across projects. The library holds one asset pool; filing an
 * entity under a project is a membership write, so the read that precedes it
 * must find the asset wherever it currently lives.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    assets: {
      get: { query: jest.fn() },
      update: { mutate: jest.fn() },
      search: { query: jest.fn() }
    },
    projects: {
      assignDocument: { mutate: jest.fn() }
    }
  }
}));

let activeProjectId: string | null = "project-a";
jest.mock("../../stores/WorkspaceTabsStore", () => ({
  LOOSE_PROJECT_ID: "default",
  useWorkspaceTabsStore: <T,>(
    selector: (s: { activeProjectId: string | null }) => T
  ): T => selector({ activeProjectId })
}));

import { trpcClient } from "../../trpc/client";
import { useDeleteEntity, useSaveEntity } from "../useEntities";

const getQuery = trpcClient.assets.get.query as jest.Mock;
const updateMutate = trpcClient.assets.update.mutate as jest.Mock;
const assignDocument = trpcClient.projects.assignDocument.mutate as jest.Mock;

const asset = {
  id: "6b3cf9b582a144a58464b510a3fd934a",
  user_id: "u1",
  name: "Untitled.png",
  content_type: "image/png",
  parent_id: "u1",
  project_id: "default",
  metadata: null,
  created_at: "2026-09-19T00:00:00Z"
};

/** The server scopes `assets.get` to a project when the input names one. */
const serverGet = ({
  id,
  project_id
}: {
  id: string;
  project_id?: string;
}): Promise<typeof asset> => {
  if (id !== asset.id) {
    return Promise.reject(new Error("Asset not found"));
  }
  if (project_id !== undefined && project_id !== asset.project_id) {
    return Promise.reject(new Error("Asset not found"));
  }
  return Promise.resolve(asset);
};

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  activeProjectId = "project-a";
  getQuery.mockImplementation(serverGet);
  updateMutate.mockImplementation(
    ({ id, metadata }: { id: string; metadata: Record<string, unknown> }) =>
      Promise.resolve({ ...asset, id, metadata })
  );
  assignDocument.mockResolvedValue({ ok: true });
});

describe("useSaveEntity", () => {
  it("tags an asset that is not yet in the destination project", async () => {
    const { result } = renderHook(() => useSaveEntity(), { wrapper });

    const entity = await result.current.mutateAsync({
      assetId: asset.id,
      createOnly: true,
      projectId: "project-a",
      kind: "character",
      name: "Ada",
      descriptor: "A tinkerer in a brass coat."
    });

    expect(entity?.id).toBe(asset.id);
    expect(entity?.project_id).toBe("project-a");
    expect(assignDocument).toHaveBeenCalledWith({
      projectId: "project-a",
      type: "entity",
      ref: asset.id
    });
  });
});

describe("useDeleteEntity", () => {
  it("untags an entity that lives outside the active project", async () => {
    const { result } = renderHook(() => useDeleteEntity(), { wrapper });

    await result.current.mutateAsync(asset.id);

    await waitFor(() => expect(updateMutate).toHaveBeenCalled());
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: asset.id })
    );
  });
});
