/** @jsxImportSource @emotion/react */
/**
 * AddClipMenu
 *
 * Popover menu for adding a generated clip to a timeline track.
 *
 * - Default tab: "Templates" — workflows tagged `"timeline-template"`.
 * - Expander: "All workflows" — all standalone workflows (run_mode IN ("workflow", null)).
 *
 * When the user picks a workflow:
 *  1. If it has multiple terminal output nodes, a second prompt asks which one to use.
 *  2. `TimelineStore.addGeneratedClip` is called to clone the workflow and create the clip.
 */

import React, { memo, useCallback, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";

import {
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  LoadingSpinner,
  EmptyState,
  Popover,
  SearchInput,
  TabGroup,
  TabPanel,
  ToolbarIconButton
} from "../ui_primitives";
import { trpc } from "../../trpc/client";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";

// ── Styles ─────────────────────────────────────────────────────────────────

const menuStyles = (theme: Theme) =>
  css({
    width: 320,
    padding: theme.spacing(1)
  });

const workflowItemStyles = (theme: Theme) =>
  css({
    padding: `${theme.spacing(0.75)} ${theme.spacing(1)}`,
    borderRadius: theme.rounded.xs,
    cursor: "pointer",
    "&:hover": {
      backgroundColor: theme.vars.palette.action.hover
    }
  });

// ── Sub-components ─────────────────────────────────────────────────────────

interface WorkflowListProps {
  workflows: Array<{
    id: string;
    name: string;
    description?: string | null;
    tags?: string[] | null;
  }>;
  isLoading: boolean;
  searchQuery: string;
  onSelect: (workflowId: string) => void;
  emptyLabel: string;
}

const WorkflowList: React.FC<WorkflowListProps> = memo(
  ({ workflows, isLoading, searchQuery, onSelect, emptyLabel }) => {
    const theme = useTheme();

    const filtered = searchQuery
      ? workflows.filter((w) =>
          w.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : workflows;

    if (isLoading) {
      return (
        <FlexRow justify="center" sx={{ py: 3 }}>
          <LoadingSpinner size="small" />
        </FlexRow>
      );
    }

    if (filtered.length === 0) {
      return (
        <EmptyState
          title={searchQuery ? "No matches" : emptyLabel}
          size="small"
        />
      );
    }

    return (
      <FlexColumn gap={0}>
        {filtered.map((wf) => (
          <FlexColumn
            key={wf.id}
            gap={0}
            css={workflowItemStyles(theme)}
            role="button"
            tabIndex={0}
            aria-label={`Add clip from "${wf.name}"`}
            onClick={() => onSelect(wf.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(wf.id);
              }
            }}
          >
            <Text size="small" weight={500}>
              {wf.name}
            </Text>
            {wf.description && (
              <Caption
                sx={{
                  color: "text.secondary",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "100%"
                }}
              >
                {wf.description}
              </Caption>
            )}
          </FlexColumn>
        ))}
      </FlexColumn>
    );
  }
);

WorkflowList.displayName = "WorkflowList";

// ── Main component ─────────────────────────────────────────────────────────

export interface AddClipMenuProps {
  /** Track to add the clip to */
  trackId: string;
  /** Start time for the new clip in milliseconds */
  startMs: number;
  /**
   * If this track is an overlay track, pass `"overlay"` so the clip's
   * mediaType is set to "overlay" instead of "video".
   */
  mediaTypeOverride?: "overlay";
  /** Anchor element for the popover */
  anchorEl: HTMLElement | null;
  /** Called when the popover should close */
  onClose: () => void;
}

/**
 * AddClipMenu — Popover for picking a workflow to add as a generated clip.
 *
 * Rendered from a track-lane context menu or the top-bar "+" button.
 */
export const AddClipMenu: React.FC<AddClipMenuProps> = memo(
  ({ trackId, startMs, mediaTypeOverride, anchorEl, onClose }) => {
    const theme = useTheme();
    const [activeTab, setActiveTab] = useState<"templates" | "all">(
      "templates"
    );
    const [searchQuery, setSearchQuery] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const addGeneratedClip = useTimelineStore((s) => s.addGeneratedClip);

    // ── Data fetching ──────────────────────────────────────────────────────

    const templatesQuery = trpc.workflows.list.useQuery(
      { tag: "timeline-template", limit: 100 },
      { staleTime: 60_000, enabled: Boolean(anchorEl) }
    );

    const allWorkflowsQuery = trpc.workflows.list.useQuery(
      { limit: 100 },
      { staleTime: 60_000, enabled: Boolean(anchorEl) && activeTab === "all" }
    );

    // ── Handlers ───────────────────────────────────────────────────────────

    const handleSelect = useCallback(
      async (workflowId: string) => {
        setIsAdding(true);
        setError(null);
        try {
          await addGeneratedClip(workflowId, trackId, startMs, {
            mediaTypeOverride
          });
          onClose();
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Failed to add clip";
          setError(msg);
        } finally {
          setIsAdding(false);
        }
      },
      [addGeneratedClip, trackId, startMs, mediaTypeOverride, onClose]
    );

    const handleTabChange = useCallback((tab: string) => {
      setActiveTab(tab as "templates" | "all");
      setSearchQuery("");
    }, []);

    // ── Templates list ─────────────────────────────────────────────────────

    const templateWorkflows = templatesQuery.data?.workflows ?? [];
    const allWorkflows = (allWorkflowsQuery.data?.workflows ?? []).filter(
      (w: { run_mode?: string | null }) => !w.run_mode || w.run_mode === "workflow"
    );

    return (
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={onClose}
        placement="bottom-left"
      >
        <FlexColumn gap={1} css={menuStyles(theme)}>
          {/* Header */}
          <FlexRow align="center" justify="space-between">
            <Text size="small" weight={600}>
              Add Generated Clip
            </Text>
            {isAdding && <LoadingSpinner size="small" />}
          </FlexRow>

          {/* Tabs */}
          <TabGroup
            size="small"
            tabs={[
              { value: "templates", label: "Templates" },
              { value: "all", label: "All workflows" }
            ]}
            value={activeTab}
            onChange={handleTabChange}
          />

          {/* Search */}
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search…"
            autoFocus
            fullWidth
            debounceMs={150}
          />

          {/* Error */}
          {error && (
            <Caption sx={{ color: "error.main" }}>{error}</Caption>
          )}

          {/* Templates tab */}
          <TabPanel value="templates" activeValue={activeTab}>
            <WorkflowList
              workflows={templateWorkflows}
              isLoading={templatesQuery.isLoading}
              searchQuery={searchQuery}
              onSelect={handleSelect}
              emptyLabel="No templates found"
            />
          </TabPanel>

          {/* All workflows tab */}
          <TabPanel value="all" activeValue={activeTab}>
            <WorkflowList
              workflows={allWorkflows}
              isLoading={allWorkflowsQuery.isLoading}
              searchQuery={searchQuery}
              onSelect={handleSelect}
              emptyLabel="No workflows found"
            />
          </TabPanel>
        </FlexColumn>
      </Popover>
    );
  }
);

AddClipMenu.displayName = "AddClipMenu";

// ── Convenience trigger button ─────────────────────────────────────────────

export interface AddClipButtonProps
  extends Omit<AddClipMenuProps, "anchorEl" | "onClose"> {
  /** Optional tooltip override */
  tooltip?: string;
}

/**
 * AddClipButton — convenience wrapper that owns its own anchor-el state and
 * renders `AddClipMenu` when clicked.
 */
export const AddClipButton: React.FC<AddClipButtonProps> = memo(
  ({ trackId, startMs, mediaTypeOverride, tooltip = "Add generated clip" }) => {
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const handleOpen = useCallback(
      (e: React.MouseEvent<HTMLElement>) => {
        setAnchorEl(e.currentTarget);
      },
      []
    );

    const handleClose = useCallback(() => {
      setAnchorEl(null);
    }, []);

    return (
      <>
        <ToolbarIconButton
          icon={<AddIcon />}
          tooltip={tooltip}
          onClick={handleOpen}
          aria-label={tooltip}
        />
        {anchorEl && (
          <AddClipMenu
            trackId={trackId}
            startMs={startMs}
            mediaTypeOverride={mediaTypeOverride}
            anchorEl={anchorEl}
            onClose={handleClose}
          />
        )}
      </>
    );
  }
);

AddClipButton.displayName = "AddClipButton";
