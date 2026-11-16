import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { trpc } from "../../trpc/client";
import { useDeleteDocument } from "../../serverState/useDeleteDocument";
import {
  useProjectDocumentFile,
  type FileDocumentType,
  type ProjectDocumentFile
} from "../../serverState/useProjectDocumentFile";
import { useProjectFolder } from "../../hooks/useProjectFolder";
import ErrorBanner from "../support/ErrorBanner";
import {
  AlertBanner,
  ConfirmDialog,
  EditorButton,
  FlexRow,
  GAP
} from "../ui_primitives";

interface DocumentFileNoticeProps {
  type: FileDocumentType;
  /** The document id. */
  refId: string;
  /** The tab's project. Absent is the loose bucket, kept in Personal. */
  projectId?: string;
}

interface FileStateProps {
  type: FileDocumentType;
  refId: string;
  projectId: string;
  file: ProjectDocumentFile;
}

/** The last segment of a project-relative path. */
const fileName = (path: string): string => path.split("/").pop() ?? path;

/**
 * An edited file NodeTool refused. The document keeps its last valid content,
 * which stays runnable, until the file is fixed.
 */
const InvalidFileNotice = ({ projectId, file }: FileStateProps) => {
  const { t } = useTranslation();
  const { folder } = useProjectFolder(projectId);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const workspaceId = folder?.workspace_id;
  const openFile = useCallback(() => {
    if (!workspaceId) return;
    openTab({
      type: "workspace-file",
      ref: `${workspaceId}::${file.path}`,
      mode: "view",
      title: fileName(file.path),
      projectId
    });
  }, [file.path, openTab, projectId, workspaceId]);

  return (
    <AlertBanner
      severity="warning"
      compact
      title={t("projectFolder.documentFile.invalidTitle")}
      action={
        workspaceId ? (
          <EditorButton size="small" variant="outlined" onClick={openFile}>
            {t("projectFolder.documentFile.openFile")}
          </EditorButton>
        ) : undefined
      }
    >
      {t("projectFolder.documentFile.invalidBody", {
        path: file.path,
        error: file.error ?? ""
      })}
    </AlertBanner>
  );
};

/** A file that is gone. Restore writes it again from the document. */
const MissingFileNotice = ({ type, refId, projectId, file }: FileStateProps) => {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const restore = trpc.projects.restoreDocumentFile.useMutation({
    onSuccess: () => utils.projects.documents.invalidate({ id: projectId })
  });
  const deleteDocument = useDeleteDocument();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const name = fileName(file.path);
  const handleRestore = useCallback(() => {
    restore.mutate({ type, ref: refId });
  }, [refId, restore, type]);
  const openDeleteDialog = useCallback(() => setConfirmingDelete(true), []);
  const closeDeleteDialog = useCallback(() => setConfirmingDelete(false), []);
  const handleDelete = useCallback(() => {
    setConfirmingDelete(false);
    deleteDocument.mutate({ id: refId, type });
  }, [deleteDocument, refId, type]);
  const failure = restore.error ?? deleteDocument.error;

  return (
    <>
      <AlertBanner
        severity="warning"
        compact
        title={t("projectFolder.documentFile.missingTitle")}
        action={
          <FlexRow gap={GAP.tight}>
            <EditorButton
              size="small"
              variant="outlined"
              onClick={handleRestore}
              disabled={restore.isPending || deleteDocument.isPending}
            >
              {t("projectFolder.documentFile.restore")}
            </EditorButton>
            <EditorButton
              size="small"
              variant="outlined"
              color="error"
              onClick={openDeleteDialog}
              disabled={restore.isPending || deleteDocument.isPending}
            >
              {t("projectFolder.documentFile.delete")}
            </EditorButton>
          </FlexRow>
        }
      >
        {t("projectFolder.documentFile.missingBody", { path: file.path })}
      </AlertBanner>
      {failure && (
        <ErrorBanner
          report={{
            source: "operation-failure",
            summary: restore.error
              ? "Restoring a document file failed"
              : "Deleting a document with a missing file failed",
            errorText: failure.message
          }}
        >
          {restore.error
            ? t("projectFolder.documentFile.restoreFailed", {
                error: failure.message
              })
            : t("projectFolder.documentFile.deleteFailed", {
                error: failure.message
              })}
        </ErrorBanner>
      )}
      <ConfirmDialog
        open={confirmingDelete}
        onClose={closeDeleteDialog}
        onConfirm={handleDelete}
        title={t("projectFolder.documentFile.deleteTitle", { name })}
        content={t("projectFolder.documentFile.deleteDescription", { name })}
        confirmText={t("projectFolder.documentFile.delete")}
        cancelText={t("projectFolder.documentFile.cancel")}
        destructive
      />
    </>
  );
};

/**
 * What is wrong with the file of a workflow or timeline, above its editor:
 * an invalid file shows its error and opens it, a missing one offers Restore
 * and Delete. Renders nothing while the file is fine.
 */
const DocumentFileNotice = ({ type, refId, projectId }: DocumentFileNoticeProps) => {
  const personalProjectId = useWorkspaceTabsStore(
    (state) => state.personalProjectId
  );
  const resolvedProjectId = projectId ?? personalProjectId;
  const file = useProjectDocumentFile(type, refId, resolvedProjectId);
  if (!file || file.state === "ok" || !resolvedProjectId) {
    return null;
  }
  const props = { type, refId, projectId: resolvedProjectId, file };
  return file.state === "invalid" ? (
    <InvalidFileNotice {...props} />
  ) : (
    <MissingFileNotice {...props} />
  );
};

export default memo(DocumentFileNotice);
