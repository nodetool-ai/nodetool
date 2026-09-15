import { act, waitFor } from "@testing-library/react";

import type { Asset } from "../../stores/ApiTypes";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";

const createdAssets = new Map<string, Asset>();
const createUpload = jest.fn();
const finalizeUpload = jest.fn();
const listAssets = jest.fn();

jest.mock("../../trpc/client", () => ({
  trpcClient: {
    assets: {
      createUpload: { mutate: createUpload },
      finalizeUpload: { mutate: finalizeUpload },
      list: { query: listAssets }
    }
  }
}));
jest.mock("../../lib/rest-fetch", () => ({ restFetch: jest.fn() }));
jest.mock("../../lib/auth", () => ({ authHeader: jest.fn() }));

import { useAssetStore } from "../../stores/AssetStore";
import { useAssetUpload } from "../useAssetUpload";

describe("project-scoped upload queue", () => {
  let releaseFirstUpload: (() => void) | undefined;
  let uploadCount = 0;

  beforeEach(() => {
    createdAssets.clear();
    uploadCount = 0;
    releaseFirstUpload = undefined;
    jest.clearAllMocks();
    useWorkspaceTabsStore.setState({
      activeProjectId: "project-a",
      personalProjectId: "personal:user-1"
    });
    useAssetUpload.setState({
      files: [],
      isUploading: false,
      overallProgress: 0,
      completed: 0
    });

    createUpload.mockImplementation(
      async (input: {
        name: string;
        content_type: string;
        project_id?: string;
      }) => {
        const assetId = `asset-${++uploadCount}`;
        createdAssets.set(assetId, {
          id: assetId,
          name: input.name,
          content_type: input.content_type,
          size: 4,
          created_at: "2026-09-13T00:00:00Z",
          parent_id: "user-1",
          user_id: "user-1",
          workflow_id: null,
          get_url: `/assets/${assetId}`,
          thumb_url: null,
          metadata: {},
          project_id: input.project_id
        });
        return {
          asset_id: assetId,
          key: `user-1/${assetId}.png`,
          upload: {
            url: `https://storage.example/${assetId}`,
            method: "PUT",
            headers: { "content-type": input.content_type },
            expires_at: 1_800_000_000_000
          }
        };
      }
    );
    finalizeUpload.mockImplementation(
      async ({ asset_id }: { asset_id: string }) => createdAssets.get(asset_id)
    );
    listAssets.mockImplementation(
      async ({ project_id }: { project_id?: string }) => ({
        assets: [...createdAssets.values()].filter(
          (asset) => asset.project_id === project_id
        ),
        next: null
      })
    );
    global.fetch = jest.fn().mockImplementation(() => {
      if (!releaseFirstUpload) {
        return new Promise((resolve) => {
          releaseFirstUpload = () => resolve({ ok: true, status: 200 });
        });
      }
      return Promise.resolve({ ok: true, status: 200 });
    });
  });

  it("keeps the queued project through direct upload and project listing", async () => {
    const completed: Asset[] = [];
    act(() => {
      useAssetUpload
        .getState()
        .uploadAsset({
          file: new File(["one"], "one.png", { type: "image/png" }),
          onCompleted: (asset) => completed.push(asset)
        });
      useAssetUpload
        .getState()
        .uploadAsset({
          file: new File(["two"], "two.png", { type: "image/png" }),
          onCompleted: (asset) => completed.push(asset)
        });
      useWorkspaceTabsStore.getState().setActiveProjectId("project-b");
    });
    await waitFor(() => expect(releaseFirstUpload).toBeDefined());
    releaseFirstUpload?.();
    await waitFor(() => expect(completed).toHaveLength(2));
    expect(completed.map((asset) => asset.project_id)).toEqual([
      "project-a",
      "project-a"
    ]);

    const projectAListing = await useAssetStore
      .getState()
      .load({ parent_id: "user-1", project_id: "project-a" });
    expect(projectAListing.assets.map((asset) => asset.id)).toEqual([
      "asset-1",
      "asset-2"
    ]);
  });
});
