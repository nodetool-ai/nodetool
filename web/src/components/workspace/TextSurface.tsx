import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import { useAssetById } from "../../serverState/useAssetById";
import { FlexColumn, LoadingSpinner, Text } from "../ui_primitives";
import TextDocumentEditor from "./TextDocumentEditor";
import TextPreview from "./TextPreview";

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

  return <TextPreview asset={asset} />;
};

export default TextSurface;
