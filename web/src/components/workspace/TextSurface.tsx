import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import { useAssetById } from "../../serverState/useAssetById";
import { FlexColumn, LoadingSpinner, Text } from "../ui_primitives";
import TextViewer from "../asset_viewer/TextViewer";
import TextDocumentEditor from "./TextDocumentEditor";

interface TextSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

/**
 * The text-document surface for a workspace tab. `refId` is a text Asset id.
 *
 * - view mode renders the read-only TextViewer (which fetches the asset text).
 * - edit mode mounts the Monaco-backed TextDocumentEditor, which loads the
 *   text, infers a language from the filename, and saves edits back via the
 *   asset update API.
 */
const TextSurface = ({ refId, mode }: TextSurfaceProps) => {
  const { data: asset, isLoading, error } = useAssetById(refId);

  if (isLoading) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{ alignItems: "center", justifyContent: "center" }}
      >
        <LoadingSpinner />
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
          Failed to load text asset
        </Text>
      </FlexColumn>
    );
  }

  if (mode === "edit") {
    return <TextDocumentEditor asset={asset} />;
  }

  return <TextViewer asset={asset} />;
};

export default TextSurface;
