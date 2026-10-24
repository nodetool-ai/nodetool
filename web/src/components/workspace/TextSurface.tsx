import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  useWorkspaceTabsStore,
  type WorkspaceTab,
  type WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import { useAssetById } from "../../serverState/useAssetById";
import { FlexColumn, LoadingSpinner, Text } from "../ui_primitives";
import TextDocumentEditor from "./TextDocumentEditor";
import TextPreview from "./TextPreview";
import SpreadsheetDocumentEditor from "./SpreadsheetDocumentEditor";
import { isSpreadsheetAsset } from "../../utils/assetLanguage";
import { WithDocumentBar, workspaceDocumentBar } from "./documentBarParts";

interface TextSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
  /** The workspace tab, whose document bar tops the surface. */
  tab: WorkspaceTab;
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
 *
 * The editors draw the tab's document bar with their save status and Save.
 * The other states get the bar with the title and View/Edit.
 */
const TextSurface = ({ refId, mode, active, tab }: TextSurfaceProps) => {
  const { t } = useTranslation();
  const { data: asset, isLoading, error } = useAssetById(refId);
  const setTabTitle = useWorkspaceTabsStore((state) => state.setTitle);

  useEffect(() => {
    if (!asset) return;
    setTabTitle(refId, "text", asset.name || "Untitled");
  }, [asset, refId, setTabTitle]);

  const documentBar = workspaceDocumentBar(tab);

  if (isLoading) {
    return (
      <WithDocumentBar tab={tab}>
        <FlexColumn
          fullWidth
          fullHeight
          sx={{ alignItems: "center", justifyContent: "center" }}
        >
          <LoadingSpinner text={t("i18n-next84.textSurface.loading")} />
        </FlexColumn>
      </WithDocumentBar>
    );
  }

  if (error || !asset) {
    return (
      <WithDocumentBar tab={tab}>
        <FlexColumn
          fullWidth
          fullHeight
          sx={{ alignItems: "center", justifyContent: "center" }}
        >
          <Text size="normal" weight={600}>
            {t("i18n-next84.textSurface.loadError")}
          </Text>
        </FlexColumn>
      </WithDocumentBar>
    );
  }

  if (isSpreadsheetAsset(asset)) {
    return (
      <SpreadsheetDocumentEditor
        asset={asset}
        readOnly={mode !== "edit"}
        active={active}
        documentBar={documentBar}
      />
    );
  }

  if (mode === "edit") {
    return (
      <TextDocumentEditor
        asset={asset}
        active={active}
        documentBar={documentBar}
      />
    );
  }

  return (
    <WithDocumentBar tab={tab}>
      <TextPreview asset={asset} />
    </WithDocumentBar>
  );
};

export default TextSurface;
