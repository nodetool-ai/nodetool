import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Text } from "../../ui_primitives";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  isFileExplorerAvailable,
  openOllamaPath,
  openInExplorer
} from "../../../utils/fileExplorer";
import { trpc } from "../../../lib/trpc";
import { useNotificationStore } from "../../../stores/NotificationStore";
import { useModels } from "./useModels";
import type { ModelScope } from "../../../stores/ModelManagerStore";

interface DeleteModelDialogProps {
  modelId: string | null;
  onClose: () => void;
  scope?: ModelScope;
}

const DeleteModelDialog: React.FC<DeleteModelDialogProps> = ({
  modelId,
  onClose,
  scope = "local"
}) => {
  const { t } = useTranslation();
  const { allModels } = useModels(scope);
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const fileExplorerAvailable = isFileExplorerAvailable();

  const deleteHFModel = async (repoId: string) => {
    await trpc.models.huggingfaceDelete.mutate({ repo_id: repoId, scope });
    addNotification({
      type: "success",
      content: t("i18n-next29.delete.notifications.deletedModel", { model: repoId }),
      dismissable: true
    });
    queryClient.invalidateQueries({ queryKey: ["huggingFaceModels"] });
    queryClient.invalidateQueries({ queryKey: ["allModels", scope] });
  };

  const deleteOllamaModel = async (modelName: string) => {
    const deleted = await trpc.models.ollamaDelete.mutate({ model: modelName });
    if (!deleted) {
      throw new Error(
        t("i18n-next29.delete.errors.ollamaDelete", { model: modelName })
      );
    }
    return modelName;
  };

  const deleteHFModelMutation = useMutation({
    mutationFn: deleteHFModel
  });

  const deleteOllamaModelMutation = useMutation({
    mutationFn: deleteOllamaModel,
    onSuccess: (modelName) => {
      addNotification({
        type: "success",
        content: t("i18n-next29.delete.notifications.deletedOllamaModel", { model: modelName }),
        dismissable: true
      });
      queryClient.invalidateQueries({ queryKey: ["ollamaModels"] });
      queryClient.invalidateQueries({ queryKey: ["allModels"] });
    }
  });

  const handleShowInExplorer = useCallback(
    async (modelId: string) => {
      if (!modelId) {
        return;
      }

      const model = allModels?.find((m) => m.id === modelId);
      if (!model) {
        return;
      }

      const isOllama = model?.type === "llama_model";

      if (isOllama) {
        await openOllamaPath();
      } else if (model?.path) {
        await openInExplorer(model.path);
      } else {
        addNotification({
          type: "warning",
          content: t("i18n-next29.delete.errors.unknownPath", { model: modelId }),
          dismissable: true
        });
      }
    },
    [allModels, addNotification, t]
  );

  const modelForExplorer = modelId
    ? allModels?.find((m) => m.id === modelId)
    : null;

  const isExplorerDisabled =
    !fileExplorerAvailable ||
    !modelId ||
    !modelForExplorer ||
    (modelForExplorer.type !== "llama_model" && !modelForExplorer.path);

  const handleConfirmDelete = async () => {
    if (modelId) {
      const model = allModels?.find((m) => m.id === modelId);
      try {
        if (model?.type === "llama_model") {
          await deleteOllamaModelMutation.mutateAsync(modelId);
        } else {
          await deleteHFModel(modelId);
        }
        onClose();
      } catch (error: unknown) {
        console.error("Deletion error:", error);

        const errorMessage =
          error instanceof Error ? error.message : t("i18n-next29.errors.unknown");

        const isNotFound =
          errorMessage.includes("Not Found") || errorMessage.includes("404");

        if (isNotFound) {
          // Model already gone — treat as success.
          addNotification({
            type: "warning",
            content: t("i18n-next29.delete.notifications.alreadyDeleted", { model: modelId }),
            dismissable: true
          });
          queryClient.invalidateQueries({ queryKey: ["ollamaModels"] });
          queryClient.invalidateQueries({ queryKey: ["huggingFaceModels"] });
          queryClient.invalidateQueries({ queryKey: ["allModels", scope] });
          onClose();
        } else {
          addNotification({
            type: "error",
            content: errorMessage,
            dismissable: true
          });
        }
      }
    } else {
      onClose();
    }
  };

  const isDeleting =
    deleteHFModelMutation.isPending || deleteOllamaModelMutation.isPending;

  const handleShowInExplorerClick = useCallback(() => {
    if (modelId) {
      handleShowInExplorer(modelId);
    }
  }, [modelId, handleShowInExplorer]);

  return (
    <Dialog
      open={!!modelId}
      onClose={onClose}
      title={t("i18n-next29.delete.title")}
      actions={
        <>
          <Button
            variant="text"
            color="inherit"
            onClick={handleShowInExplorerClick}
            disabled={isExplorerDisabled || isDeleting}
            sx={{ mr: "auto" }}
          >
            {t("i18n-next29.actions.showInExplorer")}
          </Button>
          <Button
            variant="text"
            color="inherit"
            onClick={onClose}
            disabled={isDeleting}
          >
            {t("i18n-next29.delete.cancel")}
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            loading={isDeleting}
            aria-label={t("i18n-next29.delete.confirm")}
          >
            {t("i18n-next29.delete.confirm")}
          </Button>
        </>
      }
    >
      <Text>{t("i18n-next29.delete.description", { model: modelId })}</Text>
    </Dialog>
  );
};

export default React.memo(DeleteModelDialog);
