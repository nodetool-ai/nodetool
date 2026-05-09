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
 * ## Seed-once contract (until NOD-319 wires persistence)
 *
 * `useEditorLifecycle` calls `setDocument(initialDocument)` whenever the
 * `initialDocument` prop identity changes. React Query background refetches
 * (focus, staleTime, invalidation) would otherwise emit a fresh object and
 * silently overwrite in-progress edits. Until autosave + conflict handling
 * land in NOD-319, this page:
 *
 *   1. Disables all background refetches for the load query.
 *   2. Captures the first non-null payload per `documentId` into local state
 *      and feeds *that* stable reference to `SketchEditor`. Subsequent query
 *      data is ignored for the lifetime of the route, and a new `documentId`
 *      resets the seed.
 */

import React, { memo, useEffect, useMemo, useState } from "react";
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
    {
      enabled: !!documentId,
      // Background refetches would replace `initialDocument` and clobber
      // unsaved edits until NOD-319 wires autosave. Disable them here.
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false
    }
  );

  // Seed the editor exactly once per documentId. Keyed by id so navigating
  // between documents in the same session correctly re-seeds.
  const [seed, setSeed] = useState<{
    id: string;
    document: SketchDocument;
  } | null>(null);

  useEffect(() => {
    if (!documentId) return;
    if (seed?.id === documentId) return;
    const data = documentQuery.data;
    if (!data) return;
    // The persisted `sketch` payload is the on-disk shape of `SketchDocument`.
    // Slice 1+2 widening of layer fields is handled inside the editor on load.
    const sketch = data.document.sketch as unknown as SketchDocument;
    setSeed({ id: documentId, document: sketch });
  }, [documentId, documentQuery.data, seed?.id]);

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

  // Show the spinner until we've captured a seed for this documentId.
  // Using `seed` (not the live query state) keeps the canvas mounted across
  // any future background query state changes.
  if (!seed || seed.id !== documentId) {
    if (documentQuery.isError) {
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
      <FlexColumn
        align="center"
        justify="center"
        sx={{ flex: 1, width: "100%", height: "100%" }}
      >
        <LoadingSpinner />
      </FlexColumn>
    );
  }

  return (
    <div className="sketch-editor-page" css={styles}>
      <SketchEditor initialDocument={seed.document} />
    </div>
  );
});

SketchEditorPage.displayName = "SketchEditorPage";

export default SketchEditorPage;
