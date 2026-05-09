/** @jsxImportSource @emotion/react */
/**
 * SketchEditorPage
 *
 * Top-level page shell for the standalone Image Editor at `/sketch/:documentId`.
 *
 * The page mounts the existing `SketchEditor` (which already composes
 * `ConnectedToolbar`, `ConnectedToolTopBar`, `SketchCanvasPane`,
 * `ConnectedLayersPanel`, and `ConnectedContextMenu`) inside the app shell —
 * the same components that render in the in-node `SketchModal`. Modal mode
 * remains unchanged.
 *
 * Document persistence (load/autosave) is wired in NOD-319; this shell only
 * fetches the requested document and seeds the editor with its `sketch`
 * payload as the initial document.
 */

import React, { memo, useMemo } from "react";
import { useParams } from "react-router-dom";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { EmptyState, FlexColumn, LoadingSpinner } from "../ui_primitives";
import SketchEditor from "./SketchEditor";
import { trpc } from "../../trpc/client";
import type { SketchDocument } from "./types";

const pageStyles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default
  });

const SketchEditorPage: React.FC = memo(function SketchEditorPage() {
  const theme = useTheme();
  const { documentId } = useParams<{ documentId: string }>();
  const styles = useMemo(() => pageStyles(theme), [theme]);

  const documentQuery = trpc.sketch.get.useQuery(
    { id: documentId ?? "" },
    { enabled: !!documentId, staleTime: 30_000 }
  );

  const initialDocument = useMemo<SketchDocument | undefined>(() => {
    const data = documentQuery.data;
    if (!data) return undefined;
    // The persisted `sketch` payload is the on-disk shape of `SketchDocument`.
    // Slice 1+2 widening of layer fields is handled inside the editor on load.
    return data.document.sketch as unknown as SketchDocument;
  }, [documentQuery.data]);

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

  if (documentQuery.isLoading) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        sx={{ flex: 1, width: "100%", height: "100%" }}
      >
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  if (documentQuery.isError || !documentQuery.data) {
    return (
      <FlexColumn
        align="center"
        justify="center"
        sx={{ flex: 1, width: "100%", height: "100%" }}
      >
        <EmptyState
          variant="error"
          title="Sketch document not found"
          description="The image document you requested does not exist or you do not have access to it."
        />
      </FlexColumn>
    );
  }

  return (
    <div className="sketch-editor-page" css={styles}>
      <SketchEditor initialDocument={initialDocument} />
    </div>
  );
});

SketchEditorPage.displayName = "SketchEditorPage";

export default SketchEditorPage;
