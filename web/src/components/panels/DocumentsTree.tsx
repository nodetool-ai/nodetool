import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { KeyboardEvent, MouseEvent } from "react";
import { useTheme } from "@mui/material/styles";
import type { SvgIconComponent } from "@mui/icons-material";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DataObjectOutlinedIcon from "@mui/icons-material/DataObjectOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined";
import SportsEsportsOutlinedIcon from "@mui/icons-material/SportsEsportsOutlined";
import WorkflowIcon from "@mui/icons-material/AccountTreeOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import PeopleOutlineIcon from "@mui/icons-material/PeopleOutline";
import ShareOutlinedIcon from "@mui/icons-material/ShareOutlined";
import { useLocation, useNavigate } from "react-router-dom";

import { colorForType } from "../../config/data_types";
import {
  useDocumentTreeData,
  type DocumentTreeGroup,
  type DocumentTreeLeaf,
  type DocumentTreeLeafType
} from "../../hooks/useDocumentTreeData";
import { useSharedDocumentGroup } from "../../hooks/useSharedDocumentGroup";
import { useDeleteDocument } from "../../serverState/useDeleteDocument";
import { isSharedDocumentType } from "../../serverState/useDocumentSharing";
import { useDuplicateWorkflowDocument } from "../../hooks/useDuplicateWorkflowDocument";
import { useOpenApplication } from "../../hooks/useOpenApplication";
import { useRenameDocument } from "../../hooks/useRenameDocument";
import { useNotificationStore } from "../../stores/NotificationStore";
import { usePanelStore } from "../../stores/PanelStore";
import type { BugReportContext } from "../../utils/bugReportBundle";
import { openSharedDocument } from "../../lib/openSharedDocument";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import { EntityEditorDialog } from "../entities/EntityEditorDialog";
import ShareDocumentDialog, {
  type ShareTarget
} from "../sharing/ShareDocumentDialog";
import ReportBugButton from "../support/ReportBugButton";
import { TYPE_COLOR } from "../workspace/tabTypeIdentity";
import { tabCanRename } from "../workspace/tabRename";
import {
  BORDER_RADIUS,
  Box,
  ConfirmDialog,
  ContextMenu,
  DeleteButton,
  EmptyState,
  ExpandCollapseButton,
  FlexColumn,
  FlexRow,
  InlineEditableText,
  LoadingSpinner,
  MenuItemPrimitive,
  PADDING,
  ScrollArea,
  SearchInput,
  SPACING,
  Text,
  TruncatedText,
  TYPOGRAPHY,
  PanelHeader,
  ToolbarIconButton,
  selectableRowStyles,
  ICON_SIZE
} from "../ui_primitives";

const DOCUMENT_TAB_TYPES = {
  workflow: "workflow",
  sketch: "sketch",
  script: "script",
  storyboard: "storyboard",
  timeline: "timeline",
  jsscript: "jsscript",
  game: "game",
  text: "text"
} satisfies Record<
  Exclude<DocumentTreeLeafType, "application" | "entity">,
  WorkspaceTabType
>;

/** The tab type that opens a leaf, or null for a kind no tab opens. */
const leafTabType = (type: DocumentTreeLeafType): WorkspaceTabType | null => {
  if (type === "entity") {
    return null;
  }
  return type === "application" ? "application" : DOCUMENT_TAB_TYPES[type];
};

const leafCanRename = (type: DocumentTreeLeafType): boolean => {
  const tabType = leafTabType(type);
  return tabType !== null && tabCanRename(tabType);
};

/** Games have no delete route, so their rows offer no delete action. */
const leafCanDelete = (type: DocumentTreeLeafType): boolean =>
  type !== "game";

/** The share target for a leaf, or null for a kind that cannot be shared. */
const shareTargetFor = (leaf: DocumentTreeLeaf): ShareTarget | null =>
  leaf.type === "workflow" || isSharedDocumentType(leaf.type)
    ? { type: leaf.type, id: leaf.id, name: leaf.name }
    : null;

const GROUP_ICONS: Record<DocumentTreeGroup["id"], SvgIconComponent> = {
  workflows: WorkflowIcon,
  apps: DashboardCustomizeOutlinedIcon,
  creative: BrushOutlinedIcon,
  text: ArticleOutlinedIcon,
  agents: AutoAwesomeIcon,
  entities: PersonOutlineOutlinedIcon,
  shared: PeopleOutlineIcon
};

const LEAF_ICONS: Record<DocumentTreeLeafType, SvgIconComponent> = {
  workflow: WorkflowIcon,
  application: DashboardCustomizeOutlinedIcon,
  sketch: BrushOutlinedIcon,
  script: RecordVoiceOverOutlinedIcon,
  storyboard: DashboardOutlinedIcon,
  timeline: MovieOutlinedIcon,
  entity: PersonOutlineOutlinedIcon,
  jsscript: DataObjectOutlinedIcon,
  game: SportsEsportsOutlinedIcon,
  text: ArticleOutlinedIcon
};

const LEAF_ICON_COLORS: Record<DocumentTreeLeafType, string> = {
  workflow: TYPE_COLOR.workflow,
  application: TYPE_COLOR.application,
  sketch: TYPE_COLOR.sketch,
  script: TYPE_COLOR.script,
  storyboard: TYPE_COLOR.storyboard,
  timeline: TYPE_COLOR.timeline,
  entity: colorForType("entity"),
  jsscript: TYPE_COLOR.jsscript,
  game: TYPE_COLOR.game,
  text: TYPE_COLOR.text
};

interface DocumentsTreeProps {
  readonly projectId: string;
  readonly isMobile?: boolean;
}

interface DocumentTreeRowProps {
  readonly leaf: DocumentTreeLeaf;
  readonly active: boolean;
  readonly onOpen: (document: DocumentTreeLeaf) => void;
  /** Present only for kinds that can be deleted from the tree. */
  readonly onDelete?: (document: DocumentTreeLeaf) => void;
  /** Present only for kinds that can be copied from the tree. */
  readonly onDuplicate?: (document: DocumentTreeLeaf) => void;
  /** Present only for kinds that can be renamed. */
  readonly onRename?: (document: DocumentTreeLeaf, name: string) => void;
  /** Present only for kinds the owner can share. */
  readonly onShare?: (document: DocumentTreeLeaf) => void;
}

const ROW_ACTION_CLASSES = [
  ".documents-tree-delete",
  ".documents-tree-duplicate",
  ".documents-tree-rename",
  ".documents-tree-share"
];

// Memoized: a save refetches the document index, and a project has hundreds of
// rows. `useDocumentTreeData` keeps the leaf of an unchanged document.
const DocumentTreeRow = memo(function DocumentTreeRow({
  leaf,
  active,
  onOpen,
  onDelete,
  onDuplicate,
  onRename,
  onShare
}: DocumentTreeRowProps) {
  const { t } = useTranslation();
  const Icon = LEAF_ICONS[leaf.type];
  const [editing, setEditing] = useState(false);
  const handleClick = useCallback(() => onOpen(leaf), [leaf, onOpen]);
  const handleDelete = useCallback(() => onDelete?.(leaf), [leaf, onDelete]);
  const handleDuplicate = useCallback(
    () => onDuplicate?.(leaf),
    [leaf, onDuplicate]
  );
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const handleBeginRename = useCallback(() => {
    setMenuPosition(null);
    setEditing(true);
  }, []);
  const handleCloseMenu = useCallback(() => setMenuPosition(null), []);
  const handleShare = useCallback(() => {
    setMenuPosition(null);
    onShare?.(leaf);
  }, [leaf, onShare]);
  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if ((!onRename && !onShare) || editing) {
        return;
      }
      event.preventDefault();
      // Shift+F10 and the context-menu key report no pointer position.
      if (event.clientX === 0 && event.clientY === 0) {
        const rect = event.currentTarget.getBoundingClientRect();
        setMenuPosition({ x: rect.left, y: rect.bottom });
        return;
      }
      setMenuPosition({ x: event.clientX, y: event.clientY });
    },
    [editing, onRename, onShare]
  );
  const handleCommitRename = useCallback(
    (name: string) => onRename?.(leaf, name),
    [leaf, onRename]
  );

  return (
    <FlexRow
      align="center"
      fullWidth
      className="documents-tree-row"
      sx={{
        [ROW_ACTION_CLASSES.map((name) => `& ${name}`).join(", ")]: {
          opacity: 0
        },
        [ROW_ACTION_CLASSES.flatMap((name) => [
          `&:hover ${name}`,
          `&:focus-within ${name}`
        ]).join(", ")]: { opacity: 1 }
      }}
    >
      <Box
        component={editing ? "div" : "button"}
        type={editing ? undefined : "button"}
        role="treeitem"
        aria-level={2}
        aria-selected={active}
        aria-current={active ? "page" : undefined}
        onClick={editing ? undefined : handleClick}
        onContextMenu={handleContextMenu}
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
              fontSize: ICON_SIZE.md
            })}
          />
          {editing ? (
            <InlineEditableText
              ariaLabel={t("i18n-next31.documents.rename", { name: leaf.name })}
              value={leaf.name}
              editing
              onEditingChange={setEditing}
              onCommit={handleCommitRename}
              sx={{
                ...TYPOGRAPHY.sans.label,
                minWidth: 0,
                flex: 1,
                color: "text.primary",
                bgcolor: "background.default",
                border: 1,
                borderColor: "primary.main"
              }}
            />
          ) : (
            <TruncatedText
              component="span"
              showTooltip
              sx={{ ...TYPOGRAPHY.sans.label, minWidth: 0, flex: 1 }}
            >
              {leaf.name}
            </TruncatedText>
          )}
          <Text size="smaller" color="secondary" sx={{ flexShrink: 0 }}>
            {t(`i18n-next31.documents.type.${leaf.type}`)}
          </Text>
        </FlexRow>
      </Box>
      {onRename && !editing && (
        <ToolbarIconButton
          icon={<DriveFileRenameOutlineIcon fontSize="small" />}
          tooltip={t("i18n-next31.documents.rename", { name: leaf.name })}
          aria-label={t("i18n-next31.documents.rename", { name: leaf.name })}
          onClick={handleBeginRename}
          size="small"
          className="documents-tree-rename"
        />
      )}
      {onShare && (
        <ToolbarIconButton
          icon={<ShareOutlinedIcon fontSize="small" />}
          tooltip={t("shareDocument.shareNamed", { name: leaf.name })}
          aria-label={t("shareDocument.shareNamed", { name: leaf.name })}
          onClick={handleShare}
          size="small"
          className="documents-tree-share"
        />
      )}
      {onDuplicate && (
        <ToolbarIconButton
          icon={<ContentCopyIcon fontSize="small" />}
          tooltip={t("i18n-next31.documents.duplicate", { name: leaf.name })}
          aria-label={t("i18n-next31.documents.duplicate", { name: leaf.name })}
          onClick={handleDuplicate}
          size="small"
          className="documents-tree-duplicate"
        />
      )}
      {onDelete && (
        <DeleteButton
          onClick={handleDelete}
          tooltip={t("i18n-next31.documents.delete", { name: leaf.name })}
          ariaLabel={t("i18n-next31.documents.delete", { name: leaf.name })}
          iconVariant="outline"
          className="documents-tree-delete"
        />
      )}
      {(onRename || onShare) && (
        <ContextMenu
          open={menuPosition !== null}
          position={menuPosition}
          onClose={handleCloseMenu}
        >
          {onRename && (
            <MenuItemPrimitive label={t("i18n-next31.documents.renameAction")} onClick={handleBeginRename} />
          )}
          {onShare && (
            <MenuItemPrimitive label={t("shareDocument.shareAction")} onClick={handleShare} />
          )}
        </ContextMenu>
      )}
    </FlexRow>
  );
});

interface DocumentTreeGroupRowProps {
  readonly group: DocumentTreeGroup;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly activeTabId: string | null;
  readonly onOpen: (document: DocumentTreeLeaf) => void;
  readonly onDelete: (document: DocumentTreeLeaf) => void;
  readonly onDuplicate: (document: DocumentTreeLeaf) => void;
  readonly onRename: (document: DocumentTreeLeaf, name: string) => void;
  readonly onShare: (document: DocumentTreeLeaf) => void;
}

const DocumentTreeGroupRow = ({
  group,
  expanded,
  onToggle,
  activeTabId,
  onOpen,
  onDelete,
  onDuplicate,
  onRename,
  onShare
}: DocumentTreeGroupRowProps) => {
  const { t } = useTranslation();
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
          aria-label={t(expanded ? "i18n-next31.documents.collapseGroup" : "i18n-next31.documents.expandGroup", { group: t(`i18n-next31.documents.group.${group.id}`) })}
          tabIndex={-1}
        />
        <Icon aria-hidden="true" sx={{ fontSize: ICON_SIZE.md }} />
        <TruncatedText component="span" sx={TYPOGRAPHY.sans.label}>
          {group.label}
        </TruncatedText>
        <Text size="smaller" color="secondary" sx={{ marginLeft: "auto" }}>
          {group.children.length}
        </Text>
      </FlexRow>
      {expanded && (
        <FlexColumn role="group" gap={SPACING.micro}>
          {group.children.map((document) =>
            // Someone else's document: open it, nothing else from here.
            document.sharedRole ? (
              <DocumentTreeRow
                key={`shared:${document.type}:${document.id}`}
                leaf={document}
                active={activeTabId === `${document.type}:${document.id}`}
                onOpen={onOpen}
              />
            ) : (
              <DocumentTreeRow
                key={`${document.type}:${document.id}`}
                leaf={document}
                active={activeTabId === `${document.type}:${document.id}`}
                onOpen={onOpen}
                onDelete={leafCanDelete(document.type) ? onDelete : undefined}
                onDuplicate={
                  document.type === "workflow" ? onDuplicate : undefined
                }
                onRename={leafCanRename(document.type) ? onRename : undefined}
                onShare={shareTargetFor(document) ? onShare : undefined}
              />
            )
          )}
        </FlexColumn>
      )}
    </FlexColumn>
  );
};

const DocumentsTree = ({ projectId, isMobile = false }: DocumentsTreeProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const openApplication = useOpenApplication();
  const setVisibility = usePanelStore((state) => state.setVisibility);
  const activeTabId = useWorkspaceTabsStore((state) => state.activeTabId);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const { groups: projectGroups, isLoading, isError, error } =
    useDocumentTreeData(projectId);
  const sharedGroup = useSharedDocumentGroup();
  const groups = useMemo(
    () => (sharedGroup ? [...projectGroups, sharedGroup] : projectGroups),
    [projectGroups, sharedGroup]
  );
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
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
      summary: t("i18n-next31.documents.loadFailureSummary"),
      errorText: error?.message,
      stackTrace: error?.stack
    }),
    [error, t]
  );

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return groups;
    }
    return groups
      .map((group) => ({
        ...group,
        children: group.children.filter((document) => {
          const typeLabel = t(`i18n-next31.documents.type.${document.type}`);
          const groupLabel = t(`i18n-next31.documents.group.${group.id}`);
          return `${document.name} ${typeLabel} ${groupLabel}`
            .toLowerCase()
            .includes(normalizedQuery);
        })
      }))
      .filter((group) => group.children.length > 0);
  }, [groups, query, t]);

  const handleOpen = useCallback(
    (document: DocumentTreeLeaf) => {
      if (document.sharedRole) {
        const type = leafTabType(document.type);
        if (type === null) {
          return;
        }
        openSharedDocument({
          type,
          id: document.id,
          name: document.name,
          role: document.sharedRole
        });
        if (!location.pathname.startsWith("/workspace")) {
          navigate("/workspace");
        }
        setVisibility(false);
        return;
      }
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
  // Read through a ref, so a refetch does not hand every row a new callback.
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const handleDuplicate = useCallback(
    (document: DocumentTreeLeaf) => {
      const siblingNames =
        groupsRef.current
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
            content: t("i18n-next31.documents.duplicateFailure", { name: document.name, error: (
              duplicateError instanceof Error
                ? duplicateError.message
                : t("i18n-next31.documents.unknownError")
            ) })
          })
        );
    },
    [addNotification, duplicateWorkflow, location.pathname, navigate, t]
  );

  const renameDocument = useRenameDocument();
  const handleRename = useCallback(
    (document: DocumentTreeLeaf, name: string) => {
      const type = leafTabType(document.type);
      if (type === null) {
        return;
      }
      void renameDocument(
        { type, ref: document.id, currentName: document.name },
        name
      );
    },
    [renameDocument]
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
            content: t("i18n-next31.documents.deleteFailure", { name, error: mutationError.message })
          })
      }
    );
  }, [addNotification, deleteDocument, documentToDelete, t]);

  const handleShare = useCallback((document: DocumentTreeLeaf) => {
    setShareTarget(shareTargetFor(document));
  }, []);

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
          title={t("i18n-next31.documents.title")}
          description={t("i18n-next31.documents.subtitle")}
        />
      )}
      <FlexColumn sx={{ py: SPACING.md }}>
        <SearchInput
          value={query}
          onChange={setQuery}
          ariaLabel={t("i18n-next31.documents.search")}
          placeholder={t("i18n-next31.documents.search")}
          fullWidth
        />
      </FlexColumn>
      {isLoading ? (
        <FlexColumn fullHeight align="center" justify="center">
          <LoadingSpinner text={t("i18n-next31.documents.loading")} />
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
            title={t("i18n-next31.documents.loadFailureTitle")}
            description={
              <FlexColumn align="center" gap={SPACING.sm}>
                <Text size="small">{error?.message ?? t("i18n-next31.documents.tryAgainLater")}</Text>
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
            title={query.trim() ? t("i18n-next31.documents.noMatching") : t("i18n-next31.documents.noDocuments")}
            description={
              query.trim()
                ? // This search covers documents and text files only. Name
                  // where the rest lives, or an empty result reads as "it
                  // does not exist" (study-7-I5).
                  t("i18n-next31.documents.noMatchingDescription")
                : t("i18n-next31.documents.emptyDescription")
            }
          />
        </FlexColumn>
      ) : (
        <ScrollArea fullHeight thin sx={{ flex: 1, minHeight: 0 }}>
          <FlexColumn
            role="tree"
            aria-label={t("i18n-next31.documents.treeLabel")}
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
                onRename={handleRename}
                onShare={handleShare}
              />
            ))}
          </FlexColumn>
        </ScrollArea>
      )}
      <ConfirmDialog
        open={Boolean(documentToDelete)}
        onClose={() => setDocumentToDelete(undefined)}
        onConfirm={handleConfirmDelete}
        title={t("i18n-next31.documents.deleteConfirmTitle", { type: documentToDelete?.typeLabel.toLowerCase() ?? t("i18n-next31.documents.document") })}
        content={
          documentToDelete?.type === "entity"
            ? t("i18n-next31.documents.deleteEntityDescription", { name: documentToDelete.name })
            : t("i18n-next31.documents.deleteDescription", { name: documentToDelete?.name ?? "" })
        }
        confirmText={t("i18n-next31.documents.deleteAction")}
        cancelText={t("i18n-next31.documents.cancel")}
      />
      {shareTarget && (
        <ShareDocumentDialog
          open
          onClose={() => setShareTarget(null)}
          target={shareTarget}
        />
      )}
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
