import type { DocumentLoadState } from "../../stores/documentSync";
import { EmptyState, FlexColumn, LoadingSpinner } from "../ui_primitives";

interface DocumentLoadStatusProps {
  state: Exclude<DocumentLoadState, "ready">;
  /** The document type, lowercase, as it reads mid-sentence: "storyboard". */
  label: string;
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
const DocumentLoadStatus = ({ state, label }: DocumentLoadStatusProps) => (
  <FlexColumn
    fullWidth
    fullHeight
    align="center"
    justify="center"
    sx={{ minHeight: 0 }}
  >
    {state === "loading" ? (
      <LoadingSpinner text={`Loading ${label}…`} />
    ) : (
      <EmptyState
        variant="error"
        title={`Could not load this ${label}`}
        description="The server did not answer. Close the tab and open it again to retry."
      />
    )}
  </FlexColumn>
);

export default DocumentLoadStatus;
