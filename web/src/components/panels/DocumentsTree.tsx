import { useCallback, useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { useTheme } from "@mui/material/styles";
import type { SvgIconComponent } from "@mui/icons-material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import DataObjectOutlinedIcon from "@mui/icons-material/DataObjectOutlined";
import ForumOutlinedIcon from "@mui/icons-material/ForumOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined";
import WorkflowIcon from "@mui/icons-material/AccountTreeOutlined";
import { useLocation, useNavigate } from "react-router-dom";

import {
  useDocumentTreeData,
  type DocumentTreeGroup,
  type DocumentTreeLeaf,
  type DocumentTreeLeafType
} from "../../hooks/useDocumentTreeData";
import { useOpenApplication } from "../../hooks/useOpenApplication";
import { usePanelStore } from "../../stores/PanelStore";
import type { BugReportContext } from "../../utils/bugReportBundle";
import {
  useWorkspaceTabsStore,
  type WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import { EntityEditorDialog } from "../entities/EntityEditorDialog";
import ReportBugButton from "../support/ReportBugButton";
import PanelHeadline from "../ui/PanelHeadline";
import {
  BORDER_RADIUS,
  Box,
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
  TruncatedText
} from "../ui_primitives";

const DOCUMENT_TAB_TYPES = {
  workflow: "workflow",
  sketch: "sketch",
  script: "script",
  storyboard: "storyboard",
  timeline: "timeline",
  chat: "chat",
  jsscript: "jsscript"
} satisfies Record<Exclude<DocumentTreeLeafType, "application" | "entity">, WorkspaceTabType>;

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
  chat: ForumOutlinedIcon,
  jsscript: DataObjectOutlinedIcon
};

interface DocumentsTreeProps {
  readonly projectId: string;
  readonly isMobile?: boolean;
}

interface DocumentTreeRowProps {
  readonly leaf: DocumentTreeLeaf;
  readonly active: boolean;
  readonly onOpen: (document: DocumentTreeLeaf) => void;
}

const DocumentTreeRow = ({ leaf, active, onOpen }: DocumentTreeRowProps) => {
  const Icon = LEAF_ICONS[leaf.type];
  const handleClick = useCallback(() => onOpen(leaf), [leaf, onOpen]);

  return (
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
          borderRadius: BORDER_RADIUS.md,
          color: active
            ? theme.vars.palette.text.primary
            : theme.vars.palette.text.secondary,
          backgroundColor: active
            ? theme.vars.palette.action.selected
            : "transparent",
          textAlign: "left",
          cursor: "pointer",
          "&:hover": {
            backgroundColor: theme.vars.palette.action.hover,
            color: theme.vars.palette.text.primary
          },
          "&:focus-visible": {
            outline: `2px solid ${theme.vars.palette.primary.main}`,
            outlineOffset: -2
          }
        })}
      >
        <Icon aria-hidden="true" fontSize="small" />
        <TruncatedText component="span" sx={{ minWidth: 0, flex: 1 }}>
          {leaf.name}
        </TruncatedText>
        <Text size="smaller" color="secondary">
          {leaf.typeLabel}
        </Text>
      </FlexRow>
    </Box>
  );
};

interface DocumentTreeGroupRowProps {
  readonly group: DocumentTreeGroup;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly activeTabId: string | null;
  readonly onOpen: (document: DocumentTreeLeaf) => void;
}

const DocumentTreeGroupRow = ({
  group,
  expanded,
  onToggle,
  activeTabId,
  onOpen
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
        <Icon aria-hidden="true" fontSize="small" />
        <Text size="small" weight={600} truncate>
          {group.label}
        </Text>
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
  const [entityToEdit, setEntityToEdit] = useState<DocumentTreeLeaf["entity"]>();
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
      const mode = document.type === "chat" ? "view" : "edit";
      openTab({
        type: DOCUMENT_TAB_TYPES[document.type],
        ref: document.id,
        mode,
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
        <PanelHeadline
          title="Documents"
          description="Open documents in the current project."
        />
      )}
      <FlexColumn padding={PADDING.spacious} gap={SPACING.md}>
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
                <Text size="small">
                  {error?.message ?? "Try again later."}
                </Text>
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
                : "Documents created in this project will appear here."
            }
          />
        </FlexColumn>
      ) : (
        <ScrollArea fullHeight thin sx={{ flex: 1, minHeight: 0, px: SPACING.sm }}>
          <FlexColumn role="tree" aria-label="Project documents" gap={SPACING.xs}>
            {filteredGroups.map((group) => (
              <DocumentTreeGroupRow
                key={group.id}
                group={group}
                expanded={!collapsedGroups.has(group.id)}
                onToggle={() => toggleGroup(group.id)}
                activeTabId={activeTabId}
                onOpen={handleOpen}
              />
            ))}
          </FlexColumn>
        </ScrollArea>
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
