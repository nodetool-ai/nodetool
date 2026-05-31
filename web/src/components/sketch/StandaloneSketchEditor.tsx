/** @jsxImportSource @emotion/react */
/**
 * StandaloneSketchEditor
 *
 * Loads a persisted sketch document by id and mounts the full `SketchEditor`
 * (the same component used in the in-node modal) once the document resolves.
 * Used by both the `/sketch/:documentId` page and the embedded workspace image
 * tab.
 *
 * ## Seed-once contract
 *
 * `useStandaloneSketchDocument` hydrates the global sketch store from the
 * initial document/session state when the id first resolves. React Query
 * background refetches would replace that initial seed and clobber in-progress
 * edits managed by the autosave system, so this component:
 *
 *   1. Disables all background refetches for the load query.
 *   2. Captures the first non-null payload per `documentId` into local state
 *      and feeds *that* stable reference to `SketchEditor`. Subsequent query
 *      data is ignored for the lifetime of the mount, and a new `documentId`
 *      resets the seed.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { css } from "@emotion/react";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { EmptyState, EditorButton, FlexColumn, FlexRow, LoadingSpinner } from "../ui_primitives";
import SketchEditor, { type SketchEditorHandle } from "./SketchEditor";
import { trpc } from "../../trpc/client";
import type { SketchDocument } from "./types";
import { useStandaloneSketchDocument } from "../../stores/sketch/SketchSessionStore";
import { useSaveSketchDocument } from "../../hooks/sketch/useSaveSketchDocument";

const containerStyles = (theme: Theme) =>
  css({
    width: "100%",
    height: "100%",
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default
  });

const centered = { flex: 1, width: "100%", height: "100%" } as const;

interface StandaloneSketchEditorProps {
  documentId: string;
  /** Actions rendered at the trailing edge of the editor's top mode bar. */
  headerActions?: React.ReactNode;
}

const StandaloneSketchEditor: React.FC<StandaloneSketchEditorProps> = memo(
  function StandaloneSketchEditor({ documentId, headerActions }) {
    const theme = useTheme();
    const styles = useMemo(() => containerStyles(theme), [theme]);
    const editorRef = useRef<SketchEditorHandle | null>(null);
    const { save, saving } = useSaveSketchDocument();

    const documentQuery = trpc.sketch.get.useQuery(
      { id: documentId },
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
      if (seed?.id === documentId) return;
      if (!initialEditorState) return;
      setSeed({ id: documentId, document: initialEditorState.document });
    }, [documentId, initialEditorState, seed?.id]);

    const handleSave = useCallback(() => {
      void save();
    }, [save]);

    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
          return;
        }
        if (event.key.toLowerCase() !== "s") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        void save();
      };
      window.addEventListener("keydown", handleKeyDown, true);
      return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [save]);

    const handleExportPng = () => {
      editorRef.current?.exportPng();
    };

    const documentActions = (
      <FlexRow gap={0.5} align="center" sx={{ flexShrink: 0 }}>
        <EditorButton
          size="small"
          variant="outlined"
          onClick={handleSave}
          disabled={saving}
          startIcon={<SaveOutlinedIcon fontSize="small" />}
          data-testid="sketch-save-document"
        >
          {saving ? "Saving…" : "Save"}
        </EditorButton>
        <EditorButton
          size="small"
          variant="outlined"
          onClick={handleExportPng}
          startIcon={<FileDownloadOutlinedIcon fontSize="small" />}
          data-testid="sketch-export-png"
        >
          Export PNG
        </EditorButton>
      </FlexRow>
    );

    // Show the spinner until we've captured a seed for this documentId.
    // Using `seed` (not the live query state) keeps the canvas mounted across
    // any future background query state changes.
    if (!seed || seed.id !== documentId) {
      if (documentQuery.isError) {
        return (
          <FlexColumn align="center" justify="center" sx={centered}>
            <EmptyState
              variant="error"
              title="Sketch document not found"
              description="The image document you requested does not exist or you do not have access to it."
            />
          </FlexColumn>
        );
      }
      return (
        <FlexColumn align="center" justify="center" sx={centered}>
          <LoadingSpinner />
        </FlexColumn>
      );
    }

    return (
      <div className="sketch-editor-page" css={styles}>
        <SketchEditor
          ref={editorRef}
          documentId={documentId}
          initialDocument={seed.document}
          initialEditorState={initialEditorState ?? undefined}
          headerActions={
            headerActions ? (
              <>
                {documentActions}
                {headerActions}
              </>
            ) : (
              documentActions
            )
          }
        />
      </div>
    );
  }
);

StandaloneSketchEditor.displayName = "StandaloneSketchEditor";

export default StandaloneSketchEditor;
