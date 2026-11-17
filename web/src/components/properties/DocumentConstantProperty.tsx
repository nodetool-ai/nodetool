import { useCallback, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { PropertyProps } from "../node/PropertyInput.types";
import { useWorkspaceTabsStore, creationProjectId } from "../../stores/WorkspaceTabsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpc, trpcClient } from "../../trpc/client";
import { DRAG_DATA_MIME, deserializeDragData } from "../../lib/dragdrop";
import { isDocumentFile } from "../workspaces/workspaceTreeActions";
import ProjectDocumentPreview from "../projects/ProjectDocumentPreview";
import {
  BORDER_RADIUS,
  Box,
  Caption,
  CheckerDropzone,
  FlexColumn,
  FlexRow,
  GAP,
  ToolbarIconButton,
  TruncatedText
} from "../ui_primitives";

/** The document kinds a constant node references. */
export type DocumentConstantKind =
  | "workflow"
  | "timeline"
  | "script"
  | "sketch"
  | "storyboard"
  | "application"
  | "jsscript";

/** True for a node type that is one of the document constants. */
export const isDocumentConstantNode = (nodeType: string): boolean =>
  nodeType.startsWith("nodetool.constant.");

/** What a drop on a document constant does: set this ref, or warn. */
export type DocumentDropResult =
  | { kind: "set"; id: string }
  | { kind: "reject"; message: string }
  | { kind: "ignore" };

/** The words for a kind in hints and warnings. */
const KIND_LABEL: Record<DocumentConstantKind, string> = {
  workflow: "workflow",
  timeline: "timeline",
  script: "script",
  sketch: "sketch",
  storyboard: "storyboard",
  application: "app",
  jsscript: "JS script"
};

/**
 * Resolve a drop on a `kind` constant. A Files panel document file sets the
 * ref when its document has the same kind. A sketch or timeline dragged from
 * its own panel sets the ref directly.
 */
export const resolveDocumentDrop = async (
  kind: DocumentConstantKind,
  dataTransfer: DataTransfer
): Promise<DocumentDropResult> => {
  const drag = deserializeDragData(dataTransfer);
  if (!drag) {
    return { kind: "ignore" };
  }
  if ((drag.type === "sketch" || drag.type === "timeline") && drag.type === kind) {
    return { kind: "set", id: drag.payload.id };
  }
  if (drag.type !== "project-file") {
    return {
      kind: "reject",
      message: `Drop a ${KIND_LABEL[kind]} file here.`
    };
  }
  const { projectId, path } = drag.payload;
  if (!isDocumentFile(path)) {
    return {
      kind: "reject",
      message: `${path} is not a ${KIND_LABEL[kind]} file.`
    };
  }
  const document = await trpcClient.projects.documentByFile.query({
    id: projectId,
    path
  });
  if (!document) {
    return { kind: "reject", message: `${path} has no document.` };
  }
  if (document.type !== kind) {
    return {
      kind: "reject",
      message: `${path} is not a ${KIND_LABEL[kind]} file.`
    };
  }
  return { kind: "set", id: document.ref };
};

interface DocumentConstantPropertyProps extends PropertyProps {
  documentType: DocumentConstantKind;
  untitledLabel: string;
  openEditorLabel: string;
  icon: ReactNode;
  /** Route for this kind outside the workspace, as in DocumentPickerProperty. */
  standaloneRoute?: (id: string) => string;
  /** Fields written onto the ref next to `{type, id}`. */
  extraRefFields?: Record<string, unknown>;
  /** False when the node body already draws the document (sketch, timeline). */
  showPreview?: boolean;
}

/**
 * The value of a document constant node: the linked document's name and a
 * compact preview. The value changes only by a drop of a matching file.
 */
const DocumentConstantProperty = ({
  documentType,
  untitledLabel,
  openEditorLabel,
  icon,
  standaloneRoute,
  extraRefFields,
  showPreview = true,
  value,
  onChange
}: DocumentConstantPropertyProps) => {
  const selectedId: string = value?.id || "";
  const projectId = creationProjectId();
  const { data: detail } = trpc.projects.get.useQuery(
    { id: projectId },
    { enabled: selectedId !== "", staleTime: 30_000, retry: false }
  );
  const document = detail?.documents.find(
    (entry) => entry.ref === selectedId && entry.type === documentType
  );
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const navigate = useNavigate();
  const location = useLocation();
  const [isOver, setIsOver] = useState(false);

  const handleOpenEditor = useCallback(() => {
    if (!selectedId) {
      return;
    }
    const inWorkspace = location.pathname.startsWith("/workspace");
    if (standaloneRoute && !inWorkspace) {
      navigate(standaloneRoute(selectedId));
      return;
    }
    openTab({
      type: documentType,
      ref: selectedId,
      mode: "edit",
      title: document?.name || untitledLabel,
      projectId: document ? projectId : undefined
    });
    if (!inWorkspace) {
      navigate("/workspace");
    }
  }, [
    document,
    documentType,
    location.pathname,
    navigate,
    openTab,
    projectId,
    selectedId,
    standaloneRoute,
    untitledLabel
  ]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes(DRAG_DATA_MIME)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setIsOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsOver(false), []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG_DATA_MIME)) {
        return;
      }
      // The canvas would add a new node for this drop.
      event.preventDefault();
      event.stopPropagation();
      setIsOver(false);
      try {
        const result = await resolveDocumentDrop(
          documentType,
          event.dataTransfer
        );
        if (result.kind === "set") {
          onChange({ ...extraRefFields, type: documentType, id: result.id });
        } else if (result.kind === "reject") {
          addNotification({ type: "warning", content: result.message, alert: true });
        }
      } catch (error) {
        addNotification({
          type: "error",
          content: `Could not link the file: ${error instanceof Error ? error.message : "Unknown error"}`,
          alert: true
        });
      }
    },
    [addNotification, documentType, extraRefFields, onChange]
  );

  const name = document?.name || (selectedId ? untitledLabel : "");

  return (
    <FlexColumn
      className="document-constant"
      data-testid="document-constant"
      data-drop-over={isOver ? "true" : undefined}
      gap={GAP.tight}
      fullWidth
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDoubleClick={handleOpenEditor}
    >
      {selectedId ? (
        <>
          <FlexRow gap={GAP.tight} align="center" fullWidth>
            <TruncatedText showTooltip sx={{ flex: 1, minWidth: 0 }}>
              {name}
            </TruncatedText>
            <ToolbarIconButton
              size="small"
              ariaLabel={openEditorLabel}
              tooltip={openEditorLabel}
              onClick={handleOpenEditor}
              icon={icon}
            />
          </FlexRow>
          {showPreview && document && (
            <Box sx={{ borderRadius: BORDER_RADIUS.sm, overflow: "hidden" }}>
              <ProjectDocumentPreview document={document} />
            </Box>
          )}
          {showPreview && !document && (
            <Caption>Drop a {KIND_LABEL[documentType]} file to replace it</Caption>
          )}
        </>
      ) : (
        <CheckerDropzone
          message={`Drop a ${KIND_LABEL[documentType]} file here`}
          icon={icon}
        />
      )}
    </FlexColumn>
  );
};

export default DocumentConstantProperty;
