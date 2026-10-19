import ReportBugButton from "../support/ReportBugButton";
import { useTranslation } from "react-i18next";
import type { DocumentLoadState } from "../../stores/documentSync";
import { EditorButton, EmptyState, FlexColumn, LoadingSpinner } from "../ui_primitives";

interface DocumentLoadStatusProps {
  state: Exclude<DocumentLoadState, "ready">;
  /** The document type, lowercase, as it reads mid-sentence: "storyboard". */
  label: string;
  onRetry?: () => void;
  onClose?: () => void;
  closeLabel?: string;
}

/**
 * What a document surface shows in place of itself until its initial server
 * load settles.
 *
 * The store-backed surfaces (storyboard, script, JS script) seed an empty
 * document on mount and fill it in when the server responds, so rendering them
 * straight away shows an empty document — indistinguishable from a document
 * that really is empty. This shows the load instead.
 */
const DocumentLoadStatus = ({ state, label, onRetry, onClose, closeLabel }: DocumentLoadStatusProps) => {
  const { t } = useTranslation();
  const title = t("batch2_0.documentLoadTitle", { label });
  return (
  <FlexColumn
    fullWidth
    fullHeight
    align="center"
    justify="center"
    sx={{ minHeight: 0 }}
  >
    {state === "loading" ? (
      <LoadingSpinner text={t("batch2_0.loadingDocument", { label })} />
    ) : (
      <EmptyState
        variant="error"
        title={title}
        description={t(onRetry ? "batch2_0.documentLoadRetryDescription" : "batch2_0.documentLoadCloseDescription")}
        actionText={onRetry ? t("batch2_0.retry") : undefined}
        onAction={onRetry}
      />
    )}
    {state === "error" && <ReportBugButton context={{ source: "panel-crash", summary: title }} />}
    {state === "error" && onClose && (
      <EditorButton onClick={onClose}>{closeLabel ?? t("batch2_0.closeTab")}</EditorButton>
    )}
  </FlexColumn>
  );
};

export default DocumentLoadStatus;
