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
 * ## Seed-once contract
 *
 * `useEditorLifecycle` hydrates the global sketch store from the initial
 * document/session state when the route first resolves. React Query background
 * refetches would replace that initial seed and clobber in-progress edits
 * managed by the autosave system, so this page:
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
import { useStandaloneSketchDocument } from "../../stores/sketch/SketchSessionStore";

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
      // unsaved edits managed by the autosave system. Disable them here.
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

  const initialEditorState = useStandaloneSketchDocument(
    documentQuery.data,
    !!documentId
  );

  useEffect(() => {
    if (!documentId) return;
    if (seed?.id === documentId) return;
    if (!initialEditorState) return;
    setSeed({ id: documentId, document: initialEditorState.document });
  }, [documentId, initialEditorState, seed?.id]);

  // NOTE: we used to `resetBindings()` on unmount, but React's LIFO cleanup
  // ordering meant it ran BEFORE `useStandaloneSketchDocument`'s autosave
  // flush — so the flush captured an empty bindings store and persisted
  // `layerBindings: []`, wiping the entire side-table on every navigation.
  // The next load's `setBindings(response.document.layerBindings)` replaces
  // them in full, so the explicit reset is unnecessary.

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
      <SketchEditor
        documentId={documentId}
        initialDocument={seed.document}
        initialEditorState={initialEditorState ?? undefined}
      />
    </div>
  );
});

SketchEditorPage.displayName = "SketchEditorPage";

export default SketchEditorPage;
