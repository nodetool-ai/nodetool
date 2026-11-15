/**
 * Inside a project the asset browser's folders are the directories of the
 * project folder (project folders PRD T3, T8). These tests cover the folder
 * derivation the browser and the server share, the folder tree the store
 * builds from directory folders, folder creation, and a folder rename, which
 * gives the directory a new id.
 */
import { QueryClient } from "@tanstack/react-query";
import {
  ProjectDirectoryResolver,
  directoryFolderId,
  projectDirectoryId
} from "@nodetool-ai/protocol";
import type { Asset } from "../ApiTypes";
import { useAssetStore } from "../AssetStore";
import { restFetch } from "../../lib/rest-fetch";

jest.mock("../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    assets: {
      list: { query: jest.fn() },
      get: { query: jest.fn() },
      update: { mutate: jest.fn() },
      createUpload: { mutate: jest.fn() }
    }
  }
}));

import { trpcClient } from "../../trpc/client";

const listQuery = trpcClient.assets.list.query as jest.Mock;
const getQuery = trpcClient.assets.get.query as jest.Mock;
const updateMutate = trpcClient.assets.update.mutate as jest.Mock;
const mockRestFetch = restFetch as jest.Mock;

const USER = "u1";
const PROJECT = "p1";

/** A directory folder entry as the server lists it. */
function directory(path: string): Asset {
  const slash = path.lastIndexOf("/");
  return {
    id: projectDirectoryId(PROJECT, path),
    user_id: USER,
    parent_id: directoryFolderId(USER, PROJECT, slash >= 0 ? path.slice(0, slash) : ""),
    name: path.slice(slash + 1),
    content_type: "folder",
    created_at: new Date(0).toISOString(),
    get_url: null,
    thumb_url: null,
    workflow_id: null,
    project_id: PROJECT
  };
}

describe("project folders in the asset browser", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient();
    useAssetStore.setState({ queryClient });
  });

  it("places each asset in the directory of its file, or of its parent_id chain when it has no file yet", () => {
    const resolver = new ProjectDirectoryResolver(
      PROJECT,
      new Map([
        ["legacy-folder", { id: "legacy-folder", name: "Old", parent_id: USER }]
      ])
    );
    expect(
      resolver.directoryOf({
        id: "a",
        parent_id: USER,
        workspace_path: "footage/day1/shot.png"
      })
    ).toBe("footage/day1");
    expect(
      resolver.directoryOf({ id: "b", parent_id: "legacy-folder", workspace_path: null })
    ).toBe("Old");
    expect(
      resolver.directoryOf({
        id: "c",
        parent_id: projectDirectoryId(PROJECT, "Shots"),
        workspace_path: null
      })
    ).toBe("Shots");
    expect(resolver.directoryOf({ id: "d", parent_id: USER })).toBe("");
  });

  it("nests directory folders by their parent ids in the folder tree", async () => {
    listQuery.mockResolvedValueOnce({
      assets: [directory("footage"), directory("footage/day1"), directory("Generated")],
      next: null
    });

    const tree = await useAssetStore.getState().loadFolderTree("name", PROJECT);

    expect(listQuery).toHaveBeenCalledWith({
      content_type: "folder",
      project_id: PROJECT
    });
    const footageId = projectDirectoryId(PROJECT, "footage");
    expect(Object.keys(tree)).toEqual([
      footageId,
      projectDirectoryId(PROJECT, "Generated")
    ]);
    expect(tree[footageId]!.children.map((child) => child.id)).toEqual([
      projectDirectoryId(PROJECT, "footage/day1")
    ]);
  });

  it("creates a folder inside a directory by naming the directory as its parent", async () => {
    const created = directory("footage/day2");
    mockRestFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => created
    });

    const folder = await useAssetStore
      .getState()
      .createFolder(projectDirectoryId(PROJECT, "footage"), "day2", PROJECT);

    expect(folder.id).toBe(created.id);
    const body = mockRestFetch.mock.calls[0]![1].body as FormData;
    expect(JSON.parse(body.get("json") as string)).toEqual({
      parent_id: projectDirectoryId(PROJECT, "footage"),
      content_type: "folder",
      name: "day2",
      project_id: PROJECT
    });
  });

  it("refreshes every listing when a renamed directory comes back under a new id", async () => {
    const before = directory("Shots");
    const after = directory("Takes");
    getQuery.mockResolvedValueOnce(before);
    updateMutate.mockResolvedValueOnce(after);
    queryClient.setQueryData(["asset", before.id], before);
    const invalidate = jest.spyOn(queryClient, "invalidateQueries");

    const renamed = await useAssetStore
      .getState()
      .update({ id: before.id, name: "Takes" });

    expect(renamed.id).toBe(after.id);
    expect(queryClient.getQueryData(["asset", before.id])).toBeUndefined();
    expect(queryClient.getQueryData(["asset", after.id])).toMatchObject({
      name: "Takes"
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["assets"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["folderTree"] });
  });
});
