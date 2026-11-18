import { useEffect } from "react";
import { useAsset } from "../../serverState/useAsset";
import { useAssetById } from "../../serverState/useAssetById";
import {
  useWorkspaceTabsStore,
  type WorkspaceTab
} from "../../stores/WorkspaceTabsStore";
import { assetIdFromLocator } from "../../utils/mediaRef";
import { useAssetDownload } from "../../hooks/assets/useAssetDownload";
import LazyPDFViewer from "../asset_viewer/LazyPDFViewer";
import { EmptyState } from "../ui_primitives";
import DocumentLoadStatus from "./DocumentLoadStatus";
import DocumentTablePreview from "./DocumentTablePreview";
import { WithDocumentBar } from "./documentBarParts";

interface DocumentSurfaceProps {
  tab: WorkspaceTab;
}

const DocumentSurface = ({ tab }: DocumentSurfaceProps) => {
  const assetId = assetIdFromLocator(tab.ref);
  const setTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const { isPending, refetch } = useAssetById(assetId);
  const { asset, uri } = useAsset({
    document: { type: "document", uri: tab.ref }
  });
  const { handleDownload } = useAssetDownload({ url: uri });
  useEffect(() => {
    let filename = asset?.name;
    if (!filename && !assetId) {
      try {
        const path = new URL(tab.ref, window.location.href).pathname;
        filename = decodeURIComponent(path.split("/").pop() || "");
      } catch {
        return;
      }
    }
    if (filename) {
      setTitle(tab.ref, "document", filename);
    }
  }, [asset?.name, assetId, setTitle, tab.ref]);
  const isPdf =
    asset?.content_type === "application/pdf" ||
    /\.pdf(?:[?#]|$)/i.test(asset?.name || tab.ref);
  const name = asset?.name || tab.ref;
  const tableFormat =
    /\.tsv(?:[?#]|$)/i.test(name) ||
    asset?.content_type === "text/tab-separated-values"
      ? "tsv"
      : /\.csv(?:[?#]|$)/i.test(name) || asset?.content_type === "text/csv"
        ? "csv"
        : null;

  return (
    <WithDocumentBar tab={tab} mode={null}>
      {!uri ? (
        <DocumentLoadStatus
          state={assetId && isPending ? "loading" : "error"}
          label="document"
          onRetry={assetId ? () => void refetch() : undefined}
        />
      ) : isPdf ? (
        <LazyPDFViewer url={uri} />
      ) : tableFormat ? (
        <DocumentTablePreview url={uri} format={tableFormat} />
      ) : (
        <EmptyState
          variant="no-data"
          title="No preview for this format"
          description="Download the document to open it in another app."
          actionText="Download document"
          onAction={handleDownload}
        />
      )}
    </WithDocumentBar>
  );
};

export default DocumentSurface;
