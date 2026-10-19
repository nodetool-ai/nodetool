import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import { useAssetById } from "../../serverState/useAssetById";
import { FlexColumn, LoadingSpinner, Text } from "../ui_primitives";
import TextDocumentEditor from "./TextDocumentEditor";
import TextPreview from "./TextPreview";
import SpreadsheetDocumentEditor from "./SpreadsheetDocumentEditor";
import { isSpreadsheetAsset } from "../../utils/assetLanguage";

interface TextSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

/**
 * The text-document surface for a workspace tab. `refId` is a text Asset id.
 *
 * - view mode renders the content-type-aware TextPreview (markdown rendered,
 *   code syntax-highlighted, CSV as a table, …).
 * - edit mode mounts the Monaco-backed TextDocumentEditor, which loads the
 *   text, infers a language from the filename, and saves edits back via the
 *   asset update API.
 * - Excel workbooks open in the SpreadsheetDocumentEditor table in both
 *   modes, read-only in view mode.
 */
const TextSurface = ({ refId, mode, active }: TextSurfaceProps) => {
  const { t } = useTranslation();
  const { data: asset, isLoading, error } = useAssetById(refId);
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);

  useEffect(() => {
    if (!asset) return;
    setTabTitle(refId, "text", asset.name || "Untitled");
  }, [asset, refId, setTabTitle]);

  if (isLoading) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <LoadingSpinner text={t("i18n-next84.textSurface.loading")} />
      </FlexColumn>
    );
  }

  if (error || !asset) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <Text size="normal" weight={600}>
          {t("i18n-next84.textSurface.loadError")}
        </Text>
      </FlexColumn>
    );
  }

  if (isSpreadsheetAsset(asset)) {
    return (
      <SpreadsheetDocumentEditor
        asset={asset}
        readOnly={mode !== "edit"}
        active={active}
      />
    );
  }

  if (mode === "edit") {
    return <TextDocumentEditor asset={asset} active={active} />;
  }

  return <TextPreview asset={asset} />;
};

export default TextSurface;
