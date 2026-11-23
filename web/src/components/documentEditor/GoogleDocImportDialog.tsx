/**
 * "Import Google Doc" (document editor PRD R19): paste a doc's link, and it
 * opens as a Markdown document in the project. Mounted once at the app root
 * and opened through GoogleDocImportStore.
 */
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useGoogleDocImportStore } from "../../stores/GoogleDocImportStore";
import { useTextDocumentImport } from "../../serverState/useTextDocumentTransfer";
import { Caption, Dialog, FlexColumn, GAP, TextInput } from "../ui_primitives";

const GoogleDocImportDialog = () => {
  const { t } = useTranslation();
  const projectId = useGoogleDocImportStore((state) => state.projectId);
  const close = useGoogleDocImportStore((state) => state.close);
  const { importGoogleDoc, importing } = useTextDocumentImport();
  const [link, setLink] = useState("");

  if (projectId === null) return null;

  const dismiss = () => {
    setLink("");
    close();
  };
  const submit = async () => {
    if (!link.trim()) return;
    const created = await importGoogleDoc(link.trim(), projectId);
    if (created) dismiss();
  };

  return (
    <Dialog
      open
      onClose={dismiss}
      title={t("documentEditor.importGoogleDoc.title")}
      onConfirm={() => void submit()}
      confirmText={t("documentEditor.importGoogleDoc.confirm")}
      confirmDisabled={!link.trim()}
      isLoading={importing}
    >
      <FlexColumn gap={GAP.normal}>
        <TextInput
          autoFocus
          value={link}
          onChange={(event) => setLink(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          label={t("documentEditor.importGoogleDoc.link")}
          placeholder="https://docs.google.com/document/d/…"
        />
        <Caption color="secondary">{t("documentEditor.importGoogleDoc.help")}</Caption>
      </FlexColumn>
    </Dialog>
  );
};

export default memo(GoogleDocImportDialog);
