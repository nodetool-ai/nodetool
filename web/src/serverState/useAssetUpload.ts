import { create } from "zustand";
import { Asset } from "../stores/ApiTypes";
import { useAssetStore } from "../stores/AssetStore";

type UploadFile = {
  file: File;
  workflow_id?: string;
  parent_id?: string;
  onCompleted?: (asset: Asset) => void;
  onFailed?: (error: string) => void;
  error?: string;
  progress?: number;
  status?: "uploading" | "completed" | "error";
};

type UploadState = {
  files: UploadFile[];
  maxConcurrentUploads: number;
  isUploading: boolean;
  overallProgress: number;
  completed: number;
  uploadAsset: (file: UploadFile) => void;
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

  uploadAsset: (file: UploadFile) => {
    const { handleUpload, files } = get();
    set({
      files: [...files, file],
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
      }
    )
      .then((asset: Asset) => {
        get().updateStatus(nextUploadIndex, 100, "completed");
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
