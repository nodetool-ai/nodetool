import { useMutation } from "react-query";
import { useNotificationStore } from "../stores/NotificationStore";
import { useAssetStore } from "../stores/AssetStore";
export type UploadJob = {
  files: File[];
  workflow_id: string | null;
  parent_id: string | null;
};

export const useAssetUpload = () => {
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const createAsset = useAssetStore((state) => state.createAsset);

  const performMutation = async (job: UploadJob) => {
    return await Promise.all(
      job.files.map((file) => createAsset(file, job.workflow_id, job.parent_id))
    );
  };

  const mutation = useMutation(performMutation, {
    onSuccess: () => {
      mutation.reset();
      addNotification({
        type: "info",
        alert: true,
        content: "Files uploaded!",
        dismissable: false
      });
    },
    onError: () => {
      addNotification({
        type: "error",
        alert: true,
        content: "Error uploading files.",
        dismissable: false
      });
    }
  });

  return {
    mutation
  };
};
