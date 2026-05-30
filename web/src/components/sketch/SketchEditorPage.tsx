/**
 * SketchEditorPage
 *
 * Top-level page shell for the standalone Image Editor at `/sketch/:documentId`.
 * Reads the route param and delegates document loading + editor mounting to
 * `StandaloneSketchEditor` (shared with the embedded workspace image tab).
 */

import React, { memo } from "react";
import { useParams } from "react-router-dom";

import { EmptyState, FlexColumn } from "../ui_primitives";
import StandaloneSketchEditor from "./StandaloneSketchEditor";

const SketchEditorPage: React.FC = memo(function SketchEditorPage() {
  const { documentId } = useParams<{ documentId: string }>();

  if (!documentId) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        sx={{ flex: 1, width: "100%", height: "100%" }}
      >
        <EmptyState
          variant="error"
          title="No document id"
          description="The sketch route requires a documentId path parameter."
        />
      </FlexColumn>
    );
  }

  return <StandaloneSketchEditor documentId={documentId} />;
});

SketchEditorPage.displayName = "SketchEditorPage";

export default SketchEditorPage;
