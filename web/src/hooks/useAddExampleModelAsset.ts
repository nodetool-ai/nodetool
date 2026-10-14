import { useCallback } from "react";
import { useAssetStore } from "../stores/AssetStore";
import { creationProjectId } from "../stores/WorkspaceTabsStore";
import type { Asset } from "../stores/ApiTypes";
import {
  fetchExampleModelFile,
  type ExampleModel
} from "../utils/exampleModels";

type AddExampleModelAsset = (
  model: ExampleModel,
  projectId?: string
) => Promise<Asset>;

/**
 * Copy a shipped example model into the project's assets. Every surface that
 * takes an example model (the gallery, the Examples panel, model dropzones,
 * the workflow canvas) works on the uploaded asset, never the package file.
 */
export const useAddExampleModelAsset = (): AddExampleModelAsset => {
  const createAsset = useAssetStore((state) => state.createAsset);
  return useCallback(
    async (model, projectId = creationProjectId()) => {
      const file = await fetchExampleModelFile(model);
      return createAsset(
        file,
        undefined,
        undefined,
        undefined,
        undefined,
        projectId
      );
    },
    [createAsset]
  );
};
