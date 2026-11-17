import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ConfirmDialog,
  Dialog,
  FlexColumn,
  SPACING,
  TextInput
} from "../ui_primitives";

/** A name the user types: a new folder's, or an entry's new name. */
export interface NameRequest {
  readonly kind: "create" | "rename";
  readonly initialName: string;
  readonly isDirectory: boolean;
}

interface NameDialogProps {
  readonly request: NameRequest | null;
  readonly onClose: () => void;
  readonly onSubmit: (name: string) => void;
}

/** Asks for a folder or file name, filled with the current one. */
export const WorkspaceNameDialog: React.FC<NameDialogProps> = ({
  request,
  onClose,
  onSubmit
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  useEffect(() => {
    if (request) {
      setName(request.initialName);
    }
  }, [request]);

  const submit = (): void => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== request?.initialName) {
      onSubmit(trimmed);
    } else {
      onClose();
    }
  };

  const isCreate = request?.kind === "create";
  const title = isCreate
    ? t("i18n-next27.assetCreateFolder.createTitle")
    : request?.isDirectory
      ? t("i18n-next59.folder.rename")
      : t("i18n-next27.assetRename.titleOne");
  return (
    <Dialog
      open={request !== null}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      title={title}
      onConfirm={submit}
      confirmText={
        isCreate ? t("i18n-next27.assetCreateFolder.create") : t("i18n-next27.assetRename.rename")
      }
    >
      <FlexColumn gap={SPACING.md}>
        <TextInput
          label={t("i18n-next27.assetRename.nameLabel")}
          value={name}
          autoFocus
          onFocus={(event) => event.target.select()}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              submit();
            }
          }}
          fullWidth
          autoCorrect="off"
          spellCheck="false"
        />
      </FlexColumn>
    </Dialog>
  );
};

/** An entry the user asked to delete, with the number of files it removes. */
export interface DeleteRequest {
  readonly name: string;
  readonly isDirectory: boolean;
  readonly fileCount: number;
}

interface DeleteDialogProps {
  readonly request: DeleteRequest | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export const WorkspaceDeleteDialog: React.FC<DeleteDialogProps> = ({
  request,
  onClose,
  onConfirm
}) => {
  const { t } = useTranslation();
  const files = request
    ? t(request.fileCount === 1 ? "i18n-next27.assetDelete.fileOne" : "i18n-next27.assetDelete.fileOther", {
        count: request.fileCount
      })
    : "";
  const content = request?.isDirectory
    ? `${t("i18n-next27.assetDelete.folderContains", { files })} ${t("batch2_9.versionHistory.deleteWarning")}`
    : t("batch2_9.versionHistory.deleteWarning");
  return (
    <ConfirmDialog
      open={request !== null}
      onClose={onClose}
      onConfirm={onConfirm}
      title={t("projectFolder.documentFile.deleteTitle", {
        name: request?.name ?? ""
      })}
      content={content}
      confirmText={t("i18n-next27.assetDelete.delete")}
      cancelText={t("common.cancel")}
      destructive
    />
  );
};
