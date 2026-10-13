import { useCallback, useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { useTheme } from "@mui/material/styles";
import type { SvgIconComponent } from "@mui/icons-material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DataObjectOutlinedIcon from "@mui/icons-material/DataObjectOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined";
import WorkflowIcon from "@mui/icons-material/AccountTreeOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useLocation, useNavigate } from "react-router-dom";

import { colorForType } from "../../config/data_types";
import {
  useDocumentTreeData,
  type DocumentTreeGroup,
  type DocumentTreeLeaf,
  type DocumentTreeLeafType
} from "../../hooks/useDocumentTreeData";
import { useDeleteDocument } from "../../serverState/useDeleteDocument";
import { useDuplicateWorkflowDocument } from "../../hooks/useDuplicateWorkflowDocument";
import { useOpenApplication } from "../../hooks/useOpenApplication";
import { useNotificationStore } from "../../stores/NotificationStore";
import { usePanelStore } from "../../stores/PanelStore";
import type { BugReportContext } from "../../utils/bugReportBundle";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import { EntityEditorDialog } from "../entities/EntityEditorDialog";
import ReportBugButton from "../support/ReportBugButton";
import { TYPE_COLOR } from "../workspace/tabTypeIdentity";
import {
  BORDER_RADIUS,
  Box,
  ConfirmDialog,
  DeleteButton,
  EmptyState,
  ExpandCollapseButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  PADDING,
  ScrollArea,
  SearchInput,
  SPACING,
  Text,
  TruncatedText,
  TYPOGRAPHY,
  PanelHeader,
  ToolbarIconButton,
  selectableRowStyles
} from "../ui_primitives";

const DOCUMENT_TAB_TYPES = {
  workflow: "workflow",
  sketch: "sketch",
  script: "script",
  storyboard: "storyboard",
  timeline: "timeline",
  jsscript: "jsscript"
} satisfies Record<
  Exclude<DocumentTreeLeafType, "application" | "entity">,
  WorkspaceTabType
>;

const GROUP_ICONS: Record<DocumentTreeGroup["id"], SvgIconComponent> = {
  workflows: WorkflowIcon,
  apps: DashboardCustomizeOutlinedIcon,
  creative: BrushOutlinedIcon,
  agents: AutoAwesomeIcon
};

const LEAF_ICONS: Record<DocumentTreeLeafType, SvgIconComponent> = {
  workflow: WorkflowIcon,
  application: DashboardCustomizeOutlinedIcon,
  sketch: BrushOutlinedIcon,
  script: RecordVoiceOverOutlinedIcon,
  storyboard: DashboardOutlinedIcon,
  timeline: MovieOutlinedIcon,
  entity: PersonOutlineOutlinedIcon,
  jsscript: DataObjectOutlinedIcon
};

const LEAF_ICON_COLORS: Record<DocumentTreeLeafType, string> = {
  workflow: TYPE_COLOR.workflow,
  application: TYPE_COLOR.application,
  sketch: TYPE_COLOR.sketch,
  script: TYPE_COLOR.script,
  storyboard: TYPE_COLOR.storyboard,
  timeline: TYPE_COLOR.timeline,
  entity: colorForType("entity"),
  jsscript: TYPE_COLOR.jsscript
};

interface DocumentsTreeProps {
  readonly projectId: string;
  readonly isMobile?: boolean;
}

interface DocumentTreeRowProps {
  readonly leaf: DocumentTreeLeaf;
  readonly active: boolean;
  readonly onOpen: (document: DocumentTreeLeaf) => void;
  readonly onDelete: (document: DocumentTreeLeaf) => void;
  /** Present only for kinds that can be copied from the tree. */
  readonly onDuplicate?: (document: DocumentTreeLeaf) => void;
}

const DocumentTreeRow = ({
  leaf,
  active,
  onOpen,
  onDelete,
  onDuplicate
}: DocumentTreeRowProps) => {
  const Icon = LEAF_ICONS[leaf.type];
  const handleClick = useCallback(() => onOpen(leaf), [leaf, onOpen]);
  const handleDelete = useCallback(() => onDelete(leaf), [leaf, onDelete]);
  const handleDuplicate = useCallback(
    () => onDuplicate?.(leaf),
    [leaf, onDuplicate]
  );

  return (
    <FlexRow
      align="center"
      fullWidth
      className="documents-tree-row"
      sx={{
        "& .documents-tree-delete, & .documents-tree-duplicate": { opacity: 0 },
        "&:hover .documents-tree-delete, &:focus-within .documents-tree-delete, &:hover .documents-tree-duplicate, &:focus-within .documents-tree-duplicate":
          { opacity: 1 }
      }}
    >
      <Box
        component="button"
        type="button"
        role="treeitem"
        aria-level={2}
        aria-selected={active}
        aria-current={active ? "page" : undefined}
        onClick={handleClick}
        className="documents-tree-leaf"
        sx={{
          width: "100%",
          border: 0,
          padding: 0,
          background: "transparent",
          color: "inherit",
          font: "inherit"
        }}
      >
        <FlexRow
          align="center"
          gap={SPACING.sm}
          fullWidth
          sx={(theme) => ({
            minHeight: theme.spacing(8),
            padding: `${theme.spacing(SPACING.xs)} ${theme.spacing(SPACING.sm)}`,
            paddingLeft: theme.spacing(SPACING.xxl),
            color: active
              ? theme.vars.palette.text.primary
              : theme.vars.palette.text.secondary,
            textAlign: "left",
            cursor: "pointer",
            ...selectableRowStyles(theme, { selected: active }),
            "&:hover": {
              backgroundColor: active
                ? theme.vars.palette.action.selected
                : theme.vars.palette.action.hover,
              color: theme.vars.palette.text.primary
            }
          })}
        >
          <Icon
            aria-hidden="true"
            sx={(theme) => ({
              color: `color-mix(in srgb, ${LEAF_ICON_COLORS[leaf.type]} 60%, ${theme.vars.palette.text.primary})`,
              fontSize: "var(--fontSizeBig)"
            })}
          />
          <TruncatedText
            component="span"
            showTooltip
            sx={{ ...TYPOGRAPHY.sans.label, minWidth: 0, flex: 1 }}
          >
            {leaf.name}
          </TruncatedText>
          <Text size="smaller" color="secondary" sx={{ flexShrink: 0 }}>
            {leaf.typeLabel}
          </Text>
        </FlexRow>
      </Box>
      {onDuplicate && (
        <ToolbarIconButton
          icon={<ContentCopyIcon fontSize="small" />}
          tooltip={`Duplicate ${leaf.name}`}
          aria-label={`Duplicate ${leaf.name}`}
          onClick={handleDuplicate}
          size="small"
          className="documents-tree-duplicate"
        />
      )}
      <DeleteButton
        onClick={handleDelete}
        tooltip={`Delete ${leaf.name}`}
        ariaLabel={`Delete ${leaf.name}`}
        iconVariant="outline"
        className="documents-tree-delete"
      />
    </FlexRow>
  );
};

interface DocumentTreeGroupRowProps {
  readonly group: DocumentTreeGroup;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly activeTabId: string | null;
  readonly onOpen: (document: DocumentTreeLeaf) => void;
  readonly onDelete: (document: DocumentTreeLeaf) => void;
  readonly onDuplicate: (document: DocumentTreeLeaf) => void;
}

const DocumentTreeGroupRow = ({
  group,
  expanded,
  onToggle,
  activeTabId,
  onOpen,
  onDelete,
  onDuplicate
}: DocumentTreeGroupRowProps) => {
  const theme = useTheme();
  const Icon = GROUP_ICONS[group.id];
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.currentTarget !== event.target) {
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onToggle();
      }
    },
    [onToggle]
  );
  const handleDisclosureClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onToggle();
    },
    [onToggle]
  );

  return (
    <FlexColumn
      className="documents-tree-branch"
      role="treeitem"
      aria-level={1}
      aria-expanded={expanded}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      sx={{
        borderRadius: BORDER_RADIUS.md,
        "&:focus-visible": {
          outline: `2px solid ${theme.vars.palette.primary.main}`,
          outlineOffset: -2
        }
      }}
    >
      <FlexRow
        align="center"
        gap={SPACING.xs}
        fullWidth
        onClick={onToggle}
        sx={{
          minHeight: theme.spacing(9),
          border: 0,
          borderRadius: BORDER_RADIUS.md,
          cursor: "pointer",
          userSelect: "none",
          padding: `${theme.spacing(SPACING.xs)} ${theme.spacing(SPACING.sm)}`,
          color: theme.vars.palette.text.primary,
          "&:hover": { backgroundColor: theme.vars.palette.action.hover }
        }}
      >
        <ExpandCollapseButton
          expanded={expanded}
          iconVariant="chevron"
          onClick={handleDisclosureClick}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${group.label}`}
          tabIndex={-1}
        />
        <Icon aria-hidden="true" sx={{ fontSize: "var(--fontSizeBig)" }} />
        <TruncatedText component="span" sx={TYPOGRAPHY.sans.label}>
          {group.label}
        </TruncatedText>
        <Text size="smaller" color="secondary" sx={{ marginLeft: "auto" }}>
          {group.children.length}
        </Text>
      </FlexRow>
      {expanded && (
        <FlexColumn role="group" gap={SPACING.micro}>
          {group.children.map((document) => (
            <DocumentTreeRow
              key={`${document.type}:${document.id}`}
              leaf={document}
              active={activeTabId === `${document.type}:${document.id}`}
              onOpen={onOpen}
              onDelete={onDelete}
              onDuplicate={
                document.type === "workflow" ? onDuplicate : undefined
              }
            />
          ))}
        </FlexColumn>
      )}
    </FlexColumn>
  );
};

const DocumentsTree = ({ projectId, isMobile = false }: DocumentsTreeProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const openApplication = useOpenApplication();
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { groups, isLoading, isError, error } = useDocumentTreeData(projectId);
  const [query, setQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<
    ReadonlySet<DocumentTreeGroup["id"]>
  >(() => new Set());
  const deleteDocument = useDeleteDocument();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const [documentToDelete, setDocumentToDelete] = useState<DocumentTreeLeaf>();
  const [entityToEdit, setEntityToEdit] =
    useState<DocumentTreeLeaf["entity"]>();
  const errorContext = useMemo<BugReportContext>(
    () => ({
      source: "panel-crash",
      summary: "Project documents failed to load",
      errorText: error?.message,
      stackTrace: error?.stack
    }),
    [error]
  );

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return groups;
    }
    return groups
      .map((group) => ({
        ...group,
        children: group.children.filter((document) =>
          `${document.name} ${document.typeLabel}`
            .toLowerCase()
            .includes(normalizedQuery)
        )
      }))
      .filter((group) => group.children.length > 0);
  }, [groups, query]);

  const handleOpen = useCallback(
    (document: DocumentTreeLeaf) => {
      if (document.type === "entity") {
        if (document.entity) {
          setEntityToEdit(document.entity);
        }
        return;
      }
      if (document.type === "application") {
        openApplication(document.id, document.name, document.projectId);
        return;
      }

      const title = document.name;
      openTab({
        type: DOCUMENT_TAB_TYPES[document.type],
        ref: document.id,
        mode: document.type === "timeline" ? "view" : "edit",
        title,
        projectId: document.projectId
      });

      if (
        (document.type === "sketch" || document.type === "timeline") &&
        !location.pathname.startsWith("/workspace")
      ) {
        navigate(`/${document.type}/${document.id}`);
      } else if (!location.pathname.startsWith("/workspace")) {
        navigate("/workspace");
      }
      setVisibility(false);
    },
    [location.pathname, navigate, openApplication, openTab, setVisibility]
  );

  const duplicateWorkflow = useDuplicateWorkflowDocument();
  const handleDuplicate = useCallback(
    (document: DocumentTreeLeaf) => {
      const siblingNames =
        groups
          .find((group) => group.id === "workflows")
          ?.children.map((child) => child.name) ?? [];
      duplicateWorkflow(document.id, siblingNames)
        .then(() => {
          if (!location.pathname.startsWith("/workspace")) {
            navigate("/workspace");
          }
        })
        .catch((duplicateError: unknown) =>
          addNotification({
            type: "error",
            content: `Could not duplicate ${document.name}: ${
              duplicateError instanceof Error
                ? duplicateError.message
                : "Unknown error"
            }`
          })
        );
    },
    [addNotification, duplicateWorkflow, groups, location.pathname, navigate]
  );

  const handleConfirmDelete = useCallback(() => {
    if (!documentToDelete) {
      return;
    }
    const { id, type, name } = documentToDelete;
    deleteDocument.mutate(
      { id, type },
      {
        onError: (mutationError) =>
          addNotification({
            type: "error",
            content: `Could not delete ${name}: ${mutationError.message}`
          })
      }
    );
  }, [addNotification, deleteDocument, documentToDelete]);

  const toggleGroup = useCallback((groupId: DocumentTreeGroup["id"]) => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  return (
    <FlexColumn fullHeight fullWidth gap={0}>
      {!isMobile && (
        <PanelHeader
          title="Documents"
          description="Open documents in the current project."
        />
      )}
      <FlexColumn sx={{ py: SPACING.md }}>
        <SearchInput
          value={query}
          onChange={setQuery}
          ariaLabel="Search documents"
          placeholder="Search documents"
          fullWidth
        />
      </FlexColumn>
      {isLoading ? (
        <FlexColumn fullHeight align="center" justify="center">
          <LoadingSpinner text="Loading documents" />
        </FlexColumn>
      ) : isError ? (
        <FlexColumn
          fullHeight
          align="center"
          justify="center"
          padding={PADDING.spacious}
        >
          <EmptyState
            variant="error"
            title="Could not load documents"
            description={
              <FlexColumn align="center" gap={SPACING.sm}>
                <Text size="small">{error?.message ?? "Try again later."}</Text>
                <ReportBugButton context={errorContext} />
              </FlexColumn>
            }
          />
        </FlexColumn>
      ) : filteredGroups.length === 0 ? (
        <FlexColumn
          fullHeight
          align="center"
          justify="center"
          padding={PADDING.spacious}
        >
          <EmptyState
            variant={query.trim() ? "no-results" : "empty"}
            title={query.trim() ? "No matching documents" : "No documents yet"}
            description={
              query.trim()
                ? "Try a different search term."
                : // A new text file is a Library file, not a document. Say so,
                  // or the empty panel reads as a lost save.
                  "Documents created in this project will appear here. Text files and uploads are in the Library."
            }
          />
        </FlexColumn>
      ) : (
        <ScrollArea fullHeight thin sx={{ flex: 1, minHeight: 0 }}>
          <FlexColumn
            role="tree"
            aria-label="Project documents"
            gap={SPACING.xs}
          >
            {filteredGroups.map((group) => (
              <DocumentTreeGroupRow
                key={group.id}
                group={group}
                expanded={!collapsedGroups.has(group.id)}
                onToggle={() => toggleGroup(group.id)}
                activeTabId={activeTabId}
                onOpen={handleOpen}
                onDelete={setDocumentToDelete}
                onDuplicate={handleDuplicate}
              />
            ))}
          </FlexColumn>
        </ScrollArea>
      )}
      <ConfirmDialog
        open={Boolean(documentToDelete)}
        onClose={() => setDocumentToDelete(undefined)}
        onConfirm={handleConfirmDelete}
        title={`Delete ${documentToDelete?.typeLabel.toLowerCase() ?? "document"}?`}
        content={
          documentToDelete?.type === "entity"
            ? `"${documentToDelete.name}" will stop being an entity. Its asset is kept.`
            : `"${documentToDelete?.name ?? ""}" will be permanently deleted.`
        }
        confirmText="Delete"
        cancelText="Cancel"
      />
      {entityToEdit && (
        <EntityEditorDialog
          open
          onClose={() => setEntityToEdit(undefined)}
          assetId={entityToEdit.id}
          entity={entityToEdit}
          projectId={projectId}
        />
      )}
    </FlexColumn>
  );
};

export default DocumentsTree;
