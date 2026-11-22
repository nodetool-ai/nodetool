import { create } from "zustand";
import { Asset } from "../stores/ApiTypes";
import { useAssetStore, type ImportMode } from "../stores/AssetStore";
import { useRecentAssetsStore } from "../stores/RecentAssetsStore";
import { UploadSource } from "../utils/imageUploadValidation";
import { creationProjectId } from "../stores/WorkspaceTabsStore";

export type UploadFileInput = {
  id?: string;
  file: File;
  workflow_id?: string;
  project_id?: string;
  parent_id?: string;
  /**
   * Directory in the project folder the file was dropped on (`.` is the
   * folder itself). Omitted, the server saves the upload in `Imported/`.
   */
  directory?: string;
  source?: UploadSource;
  /**
   * Copy or Link, as chosen in the import dialog. Omitted, a desktop import
   * links a file at or above the server's size threshold.
   */
  importMode?: ImportMode;
  onCompleted?: (asset: Asset) => void;
  onFailed?: (error: string) => void;
  error?: string;
  progress?: number;
  status?: "uploading" | "completed" | "error";
};

type UploadFile = Required<Pick<UploadFileInput, 'id'>> & Omit<UploadFileInput, 'id'>;

type UploadState = {
  files: UploadFile[];
  maxConcurrentUploads: number;
  isUploading: boolean;
  overallProgress: number;
  completed: number;
  uploadAsset: (file: UploadFileInput) => void;
  updateStatus: (
    index: number,
    progress: number,
    status: "uploading" | "completed" | "error",
    error?: string
  ) => void;
  handleUpload: () => void;
};

export const useAssetUpload = create<UploadState>((set, get) => ({
  files: [],
  maxConcurrentUploads: 3,
  isUploading: false,
  overallProgress: 0,
  completed: 0,

  uploadAsset: (file: UploadFileInput) => {
    const { handleUpload, files } = get();
    const fileWithId: UploadFile = {
      ...file,
      id: file.id || crypto.randomUUID(),
      project_id: file.project_id ?? creationProjectId()
    };
    set({
      files: [...files, fileWithId],
    });
    handleUpload();
  },

  updateStatus: (index, progress, status, error) =>
    set((state) => {
      const updatedFiles = [...state.files];
      if (index >= updatedFiles.length) {
        return state;
      }
      updatedFiles[index].progress = progress;
      updatedFiles[index].status = status;
      updatedFiles[index].error = error;
      return {
        files: updatedFiles,
        isUploading: updatedFiles.some(
          (file) => file.status === "uploading" || file.status === undefined
        ),
        overallProgress:
          updatedFiles.reduce((acc, file) => acc + (file.progress || 0), 0) /
          updatedFiles.length,
        completed: updatedFiles.filter((file) => file.status === "completed")
          .length,
      };
    }),

  handleUpload: () => {
    const { files, updateStatus } = get();
    const nextUploadIndex = files.findIndex(
      (file) => file.status === undefined
    );
    if (nextUploadIndex === -1) {
      // Another upload is still running; its own completion clears the queue.
      if (files.some((file) => file.status === "uploading")) {
        return;
      }
      set({
        files: [],
        isUploading: false,
        completed: 0,
        overallProgress: 0,
      });
      return;
    }
    updateStatus(nextUploadIndex, 0, "uploading");

    const uploadFile = files[nextUploadIndex];

    const createAsset = useAssetStore.getState().createAsset;

    createAsset(
      uploadFile.file,
      uploadFile.workflow_id,
      uploadFile.parent_id,
      (progressEvent) => {
        const progress = (progressEvent.loaded / progressEvent.total) * 100;
        get().updateStatus(nextUploadIndex, progress, "uploading");
      },
      uploadFile.source,
      uploadFile.project_id,
      uploadFile.directory,
      uploadFile.importMode
    )
      .then((asset: Asset) => {
        get().updateStatus(nextUploadIndex, 100, "completed");
        useRecentAssetsStore.getState().addRecentAsset(asset);
        uploadFile.onCompleted?.(asset);
      })
      .catch((err) => {
        get().updateStatus(nextUploadIndex, 100, "error", err.message);
        uploadFile.onFailed?.(err.message);
      })
      .finally(() => {
        get().handleUpload();
      });
  },
}));

export default useAssetUpload;
