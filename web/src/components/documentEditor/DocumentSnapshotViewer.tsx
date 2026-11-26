/** @jsxImportSource @emotion/react */
/**
 * Read-only formatted snapshot viewer for Snapshots Mode (document editor PRD
 * R11, R31). Mounts an isolated non-editable LexicalComposer with the same
 * nodes and page styles as the live editor so text is cleanly formatted,
 * scrollable, selectable, and copyable (Ctrl+C / Cmd+C) without ever mutating
 * the snapshot.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { identifyBlocks, splitMarkdownBlocks } from "@nodetool-ai/protocol";

import { newDocumentId } from "../../lib/newDocumentId";
import { relativeTime } from "../../utils/formatDateAndTime";
import ErrorBanner from "../support/ErrorBanner";
import {
  Caption,
  Chip,
  EmptyState,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  PADDING,
  PanelHeader,
  cn
} from "../ui_primitives";
import {
  documentPaperThemeClass,
  type DocumentPaperTheme
} from "./DocumentDisplayControls";
import { DOCUMENT_THEME, documentEditorStyles } from "./documentEditorStyles";
import { DOCUMENT_NODES, MarkdownDocumentBinding } from "./markdownBlockCodec";
import {
  DocumentOutlinePlugin,
  type DocumentOutline
} from "./DocumentOutlinePlugin";

export interface SnapshotVersionMeta {
  version: number;
  name: string | null;
  save_type: string;
  created_at: string;
}

export interface DocumentSnapshotViewerProps {
  version: SnapshotVersionMeta | null;
  content: string | null;
  isLoading: boolean;
  error?: unknown;
  paperTheme?: DocumentPaperTheme;
  zoom?: number;
  /** Receives the snapshot's heading outline, or null when none is shown. */
  onOutlineChange?: (outline: DocumentOutline | null) => void;
}

function SnapshotContentPlugin({ content }: { content: string }): null {
  const [editor] = useLexicalComposerContext();
  const [binding] = useState(() => new MarkdownDocumentBinding(newDocumentId));

  useEffect(() => {
    const split = splitMarkdownBlocks(content);
    const blocks = identifyBlocks([], split.blocks, newDocumentId);
    binding.load(editor, { leading: split.leading, blocks });
  }, [binding, content, editor]);

  return null;
}

export const DocumentSnapshotViewer = ({
  version,
  content,
  isLoading,
  error = null,
  paperTheme = "theme",
  zoom = 1,
  onOutlineChange
}: DocumentSnapshotViewerProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => documentEditorStyles(theme), [theme]);
  const initialConfig = useMemo(
    () => ({
      namespace: "document-snapshot-viewer",
      nodes: [...DOCUMENT_NODES],
      theme: DOCUMENT_THEME,
      editable: false,
      onError: (error: Error) => {
        console.error("Document snapshot viewer error", error);
      }
    }),
    []
  );

  if (version === null) {
    return (
      <FlexColumn
        fullWidth
        fullHeight
        sx={{
          flex: 1,
          minHeight: 0,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <EmptyState
          title={t(
            "documentEditor.snapshots.noneSelectedTitle",
            "No snapshot selected"
          )}
          description={t(
            "documentEditor.snapshots.noneSelectedBody",
            "Select a snapshot to compare it side by side and copy passages."
          )}
        />
      </FlexColumn>
    );
  }

  const title =
    version.name ||
    t("documentEditor.versions.versionNumber", {
      version: version.version,
      defaultValue: "Version {{version}}"
    });

  const zoomStyle = { "--doc-zoom": String(zoom) } as CSSProperties;

  return (
    <FlexColumn
      fullWidth
      fullHeight
      sx={{ flex: 1, minHeight: 0, minWidth: 0 }}
    >
      <PanelHeader
        title={title}
        actions={
          <FlexRow align="center" gap={GAP.normal}>
            <Caption color="secondary">
              {relativeTime(version.created_at)}
            </Caption>
            <Chip
              compact
              size="small"
              label={t("documentEditor.snapshots.readOnly", "Read-only")}
            />
          </FlexRow>
        }
      />
      {error ? (
        <FlexColumn
          fullWidth
          fullHeight
          sx={{
            flex: 1,
            minHeight: 0,
            alignItems: "center",
            justifyContent: "center",
            padding: PADDING.normal
          }}
        >
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: "Document snapshot failed to load",
              errorText: String(error)
            }}
          >
            {t(
              "documentEditor.snapshots.loadError",
              "This snapshot could not be loaded."
            )}
          </ErrorBanner>
        </FlexColumn>
      ) : isLoading || content === null ? (
        <FlexColumn
          fullWidth
          fullHeight
          sx={{
            flex: 1,
            minHeight: 0,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <LoadingSpinner />
        </FlexColumn>
      ) : content.trim().length === 0 ? (
        <FlexColumn
          fullWidth
          fullHeight
          sx={{
            flex: 1,
            minHeight: 0,
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <EmptyState
            title={t(
              "documentEditor.snapshots.emptyContentTitle",
              "Empty snapshot"
            )}
            description={t(
              "documentEditor.snapshots.emptyContentBody",
              "This snapshot had no text when it was saved."
            )}
          />
        </FlexColumn>
      ) : (
        <div
          css={styles}
          className="doc-snapshot-viewer"
          style={{ ...zoomStyle, flex: 1, minHeight: 0 }}
        >
          <div
            key={version.version}
            className={cn("doc-scroll", documentPaperThemeClass(paperTheme))}
          >
            <div className="doc-page">
              <LexicalComposer
                key={version.version}
                initialConfig={initialConfig}
              >
                <RichTextPlugin
                  contentEditable={
                    <ContentEditable
                      className="doc-input"
                      aria-label={t(
                        "documentEditor.snapshots.viewerLabel",
                        "Snapshot preview"
                      )}
                      aria-readonly="true"
                    />
                  }
                  ErrorBoundary={LexicalErrorBoundary}
                />
                <SnapshotContentPlugin content={content} />
                {onOutlineChange && (
                  <DocumentOutlinePlugin onChange={onOutlineChange} />
                )}
              </LexicalComposer>
            </div>
          </div>
        </div>
      )}
    </FlexColumn>
  );
};

export default DocumentSnapshotViewer;
