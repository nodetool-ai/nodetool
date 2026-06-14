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
 *  1. If it has multiple terminal output nodes, a second step asks which one to use.
 *  2. `TimelineStore.addGeneratedClip` is called to clone the workflow and create the clip.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

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
  TextInput,
  ToolbarIconButton
} from "../ui_primitives";
import { trpc } from "../../trpc/client";
import { trpcClient } from "../../trpc/client";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";
import { useTimelineDirectGenJob } from "../../hooks/timeline/useTimelineDirectGenJob";
import { useLastDirectGenModel } from "../../hooks/timeline/useLastDirectGenModel";
import ImageModelSelect from "../properties/ImageModelSelect";
import VideoModelSelect from "../properties/VideoModelSelect";
import TTSModelSelect from "../properties/TTSModelSelect";
import type { ImageModelValue, TTSModelValue } from "../../stores/ApiTypes";
import type { TimelineTrack } from "@nodetool-ai/timeline";

interface VideoModelChange {
  type: "video_model";
  id: string;
  provider: string;
  name: string;
}

type DirectGenKind = "image" | "video" | "audio";

/**
 * Map a track type to the direct-gen flavour that makes sense on it.
 * Subtitle tracks fall through to `null` — the prompt section is hidden
 * and only workflow-bound clips remain available.
 */
const trackDirectGenKind = (
  trackType: TimelineTrack["type"]
): DirectGenKind | null => {
  switch (trackType) {
    case "video":
      return "video";
    case "overlay":
      return "image";
    case "audio":
      return "audio";
    default:
      return null;
  }
};

const trackMediaType = (
  trackType: TimelineTrack["type"]
): "image" | "video" | "audio" | "overlay" | null => {
  switch (trackType) {
    case "video":
      return "video";
    case "overlay":
      return "overlay";
    case "audio":
      return "audio";
    default:
      return null;
  }
};

// ── Styles ─────────────────────────────────────────────────────────────────

const menuStyles = (theme: Theme) =>
  css({
    width: 360,
    padding: theme.spacing(1)
  });

const workflowItemStyles = (theme: Theme) =>
  css({
    padding: `${theme.spacing(1)} ${theme.spacing(1)}`,
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

    const filtered = useMemo(
      () =>
        searchQuery
          ? workflows.filter((w) =>
              w.name.toLowerCase().includes(searchQuery.toLowerCase())
            )
          : workflows,
      [workflows, searchQuery]
    );

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

// ── Output-node selection sub-panel ────────────────────────────────────────

interface TerminalOutputItem {
  id: string;
  type: string;
  mediaType: "image" | "video" | "audio";
  name: string;
}

interface OutputSelectPanelProps {
  outputs: TerminalOutputItem[];
  workflowName: string;
  onSelect: (outputNodeId: string) => void;
  onBack: () => void;
}

const OutputSelectPanel: React.FC<OutputSelectPanelProps> = memo(
  ({ outputs, workflowName, onSelect, onBack }) => {
    const theme = useTheme();

    return (
      <FlexColumn gap={1}>
        <FlexRow align="center" gap={0.5}>
          <ToolbarIconButton
            icon={<ArrowBackIcon fontSize="small" />}
            tooltip="Back"
            onClick={onBack}
            aria-label="Back to workflow list"
          />
          <Text size="small" weight={500} sx={{ flex: 1 }}>
            Select output - {workflowName}
          </Text>
        </FlexRow>
        <Caption sx={{ color: "text.secondary" }}>
          This workflow has multiple output nodes. Pick one:
        </Caption>
        <FlexColumn gap={0}>
          {outputs.map((out) => (
            <FlexColumn
              key={out.id}
              gap={0}
              css={workflowItemStyles(theme)}
              role="button"
              tabIndex={0}
              aria-label={`Use ${out.name || out.type} output`}
              onClick={() => onSelect(out.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(out.id);
                }
              }}
            >
              <Text size="small" weight={500}>
                {out.name || out.type}
              </Text>
              <Caption sx={{ color: "text.secondary" }}>
                {out.mediaType}
              </Caption>
            </FlexColumn>
          ))}
        </FlexColumn>
      </FlexColumn>
    );
  }
);

OutputSelectPanel.displayName = "OutputSelectPanel";

// ── Main component ─────────────────────────────────────────────────────────

export interface AddClipMenuProps {
  /** Track to add the clip to */
  trackId: string;
  /** Start time for the new clip in milliseconds */
  startMs: number;
  /**
   * Track type — drives which direct-gen flow is offered (video tracks get
   * the video model selector + text-to-video binding; overlay tracks get the
   * image selector + an overlay clip; audio/subtitle tracks hide the prompt
   * section entirely and only expose workflow-bound clips).
   */
  trackType: TimelineTrack["type"];
  /** Anchor element for the popover */
  anchorEl: HTMLElement | null;
  /** Called when the popover should close */
  onClose: () => void;
}

/**
 * AddClipMenu — Popover for adding a generated clip to the timeline.
 *
 * The popover opens on a **prompt-first** layout: type a prompt + pick an
 * image model and press Enter to drop a direct-gen clip at the playhead.
 * Workflow-bound generation lives under the tabs below.
 *
 * Rendered from a track-lane context menu or the top-bar "+" button.
 */
export const AddClipMenu: React.FC<AddClipMenuProps> = memo(
  ({ trackId, startMs, trackType, anchorEl, onClose }) => {
    const theme = useTheme();
    const directGenKind = trackDirectGenKind(trackType);
    const mediaTypeForClip = trackMediaType(trackType);
    const [activeTab, setActiveTab] = useState<"templates" | "all">(
      "templates"
    );
    const [searchQuery, setSearchQuery] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Direct-gen prompt state ────────────────────────────────────────────
    const lastModel = useLastDirectGenModel(directGenKind ?? "image");
    const [prompt, setPrompt] = useState("");
    const [directProvider, setDirectProvider] = useState<string | undefined>(
      undefined
    );
    const [directModel, setDirectModel] = useState<string | undefined>(
      undefined
    );
    const [directVoice, setDirectVoice] = useState<string | undefined>(
      undefined
    );

    // Reset transient state when the popover (re)opens. Without this, a stale
    // prompt or error from a previous open would still be visible, and the
    // model picker wouldn't reflect any direct-gen clips added since.
    useEffect(() => {
      if (!anchorEl) return;
      setPrompt("");
      setError(null);
      setDirectProvider(lastModel.provider);
      setDirectModel(lastModel.model);
      setDirectVoice(lastModel.voice);
    // Seed defaults on open only — picking up `lastModel` changes while the
    // popover is already open would stomp the user's mid-edit choices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchorEl]);

    // Multi-output selection state
    const [pendingWorkflow, setPendingWorkflow] = useState<{
      id: string;
      name: string;
    } | null>(null);
    const [terminalOutputs, setTerminalOutputs] = useState<
      TerminalOutputItem[] | null
    >(null);

    const addGeneratedClip = useTimelineStore((s) => s.addGeneratedClip);
    const addDirectGenClip = useTimelineStore((s) => s.addDirectGenClip);
    const selectClip = useTimelineUIStore((s) => s.selectClip);
    const directGen = useTimelineDirectGenJob();

    // ── Data fetching ──────────────────────────────────────────────────────

    const templatesQuery = trpc.workflows.list.useQuery(
      { tag: "timeline-template", limit: 100, mediaOutput: true },
      { staleTime: 60_000, enabled: Boolean(anchorEl) }
    );

    const allWorkflowsQuery = trpc.workflows.list.useQuery(
      { limit: 100, mediaOutput: true },
      { staleTime: 60_000, enabled: Boolean(anchorEl) && activeTab === "all" }
    );

    // ── Helpers ────────────────────────────────────────────────────────────

    const createClip = useCallback(
      async (workflowId: string, selectedOutputNodeId?: string) => {
        setIsAdding(true);
        setError(null);
        try {
          await addGeneratedClip(workflowId, trackId, startMs, {
            // `addGeneratedClip` only knows about the `"overlay"` override; for
            // image/video tracks it picks mediaType from the workflow output.
            mediaTypeOverride: trackType === "overlay" ? "overlay" : undefined,
            selectedOutputNodeId
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
      [addGeneratedClip, trackId, startMs, trackType, onClose]
    );

    // ── Handlers ───────────────────────────────────────────────────────────

    const handleSelect = useCallback(
      async (workflowId: string) => {
        // Resolve the workflow name from the list data for the output-select header
        const allWfs = [
          ...(templatesQuery.data?.workflows ?? []),
          ...(allWorkflowsQuery.data?.workflows ?? [])
        ];
        const wfMeta = allWfs.find((w) => w.id === workflowId);
        const workflowName = wfMeta?.name ?? workflowId;

        setIsAdding(true);
        setError(null);
        try {
          const result = await trpcClient.workflows.terminalOutputs.query({
            id: workflowId
          });

          if (result.outputs.length === 0) {
            // Server will throw TIMELINE_NO_MEDIA_OUTPUT; surface gracefully
            throw new Error(
              "This workflow has no media output node (image, video, or audio)."
            );
          }

          if (result.outputs.length === 1) {
            // Single output — proceed directly
            const singleOutputId = result.outputs[0]?.id;
            if (!singleOutputId) return;
            await createClip(workflowId, singleOutputId);
          } else {
            // Multiple outputs — show selection panel
            // result.outputs matches TerminalOutputItem[] (typed by tRPC schema)
            setPendingWorkflow({ id: workflowId, name: workflowName });
            setTerminalOutputs(result.outputs);
            setIsAdding(false);
          }
        } catch (err) {
          const msg =
            err instanceof Error ? err.message : "Failed to add clip";
          setError(msg);
          setIsAdding(false);
        }
      },
      [createClip, templatesQuery.data, allWorkflowsQuery.data]
    );

    const handleOutputSelect = useCallback(
      async (selectedOutputNodeId: string) => {
        if (!pendingWorkflow) return;
        setPendingWorkflow(null);
        setTerminalOutputs(null);
        await createClip(pendingWorkflow.id, selectedOutputNodeId);
      },
      [pendingWorkflow, createClip]
    );

    const handleBack = useCallback(() => {
      setPendingWorkflow(null);
      setTerminalOutputs(null);
      setError(null);
    }, []);

    const handleTabChange = useCallback((tab: string) => {
      setActiveTab(tab as "templates" | "all");
      setSearchQuery("");
    }, []);

    const handleDirectModelChange = useCallback((v: ImageModelValue) => {
      setDirectProvider(v.provider);
      setDirectModel(v.id);
    }, []);

    const handleDirectVideoModelChange = useCallback((v: VideoModelChange) => {
      setDirectProvider(v.provider);
      setDirectModel(v.id);
    }, []);

    const handleDirectTTSModelChange = useCallback((v: TTSModelValue) => {
      setDirectProvider(v.provider);
      setDirectModel(v.id);
      setDirectVoice(v.selected_voice || v.voices?.[0] || undefined);
    }, []);

    const canSubmitPrompt =
      directGenKind !== null &&
      prompt.trim().length > 0 &&
      !!directProvider &&
      !!directModel &&
      !isAdding;

    const handlePromptSubmit = useCallback(async () => {
      if (!canSubmitPrompt) return;
      if (!directGenKind || !mediaTypeForClip) return;
      // Clear any stale failure toast from a prior attempt before we try
      // again — the user shouldn't see an error linger after a successful
      // retry.
      setError(null);
      setIsAdding(true);
      try {
        const bindingKind =
          directGenKind === "video"
            ? "text-to-video"
            : directGenKind === "audio"
              ? "text-to-audio"
              : "text-to-image";
        const clipId = addDirectGenClip({
          trackId,
          startMs,
          mediaType: mediaTypeForClip,
          bindingKind,
          prompt: prompt.trim(),
          provider: directProvider,
          model: directModel,
          voice: directGenKind === "audio" ? directVoice : undefined
        });
        selectClip(clipId);
        // Kick off generation right away — the whole point is "type → see".
        await directGen.start(clipId);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add clip");
      } finally {
        setIsAdding(false);
      }
    }, [
      canSubmitPrompt,
      directGenKind,
      mediaTypeForClip,
      addDirectGenClip,
      trackId,
      startMs,
      prompt,
      directProvider,
      directModel,
      directVoice,
      selectClip,
      directGen,
      onClose
    ]);

    const handlePromptKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          void handlePromptSubmit();
        }
      },
      [handlePromptSubmit]
    );

    // ── Templates list ─────────────────────────────────────────────────────

    const templateWorkflows = templatesQuery.data?.workflows ?? [];
    // The server-side default filter already restricts to standalone run_modes
    // (run_mode IN ("workflow", null)), so no client-side filtering is needed here.
    const allWorkflows = allWorkflowsQuery.data?.workflows ?? [];

    return (
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={onClose}
        placement="bottom-left"
      >
        <FlexColumn gap={1} css={menuStyles(theme)}>
          {/* Header (hidden when showing output-select sub-panel) */}
          {!terminalOutputs && (
            <>
              <FlexRow align="center" justify="space-between">
                <Text size="small" weight={600}>
                  Add Generated Clip
                </Text>
                {isAdding && <LoadingSpinner size="small" />}
              </FlexRow>

              {/* ── Prompt-first quick-add ────────────────────────────────── */}
              {directGenKind !== null && (
                <>
                  <FlexColumn gap={0.5} data-testid="add-clip-prompt-section">
                    <TextInput
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={handlePromptKeyDown}
                      placeholder={
                        directGenKind === "video"
                          ? "Describe a video and press Enter…"
                          : directGenKind === "audio"
                            ? "Type text to speak and press Enter…"
                            : "Describe an image and press Enter…"
                      }
                      multiline
                      minRows={2}
                      maxRows={5}
                      compact
                      autoFocus
                      fullWidth
                      inputProps={{
                        "aria-label": "Prompt",
                        "data-testid": "add-clip-prompt-input"
                      }}
                    />
                    <Caption
                      sx={(theme) => ({
                        color: "text.disabled",
                        textAlign: "right",
                        fontSize: theme.fontSizeSmaller
                      })}
                    >
                      ↵ generate · ⇧↵ new line
                    </Caption>
                    {directGenKind === "video" ? (
                      <VideoModelSelect
                        value={directModel ?? ""}
                        task="text_to_video"
                        onChange={handleDirectVideoModelChange}
                      />
                    ) : directGenKind === "audio" ? (
                      <TTSModelSelect
                        value={
                          directModel
                            ? ({
                                type: "tts_model",
                                id: directModel,
                                provider: directProvider ?? "",
                                name: directModel,
                                voices: directVoice ? [directVoice] : [],
                                selected_voice: directVoice ?? ""
                              } as TTSModelValue)
                            : ""
                        }
                        onChange={handleDirectTTSModelChange}
                      />
                    ) : (
                      <ImageModelSelect
                        value={directModel ?? ""}
                        task="text_to_image"
                        onChange={handleDirectModelChange}
                      />
                    )}
                  </FlexColumn>

                  <Caption
                    sx={(theme) => ({
                      color: "text.disabled",
                      textAlign: "center",
                      fontSize: theme.fontSizeSmaller
                    })}
                  >
                    - or use a workflow -
                  </Caption>
                </>
              )}

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
            </>
          )}

          {/* Multi-output selection sub-panel */}
          {terminalOutputs && pendingWorkflow && (
            <OutputSelectPanel
              outputs={terminalOutputs}
              workflowName={pendingWorkflow.name}
              onSelect={handleOutputSelect}
              onBack={handleBack}
            />
          )}
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
  ({ trackId, startMs, trackType, tooltip = "Add generated clip" }) => {
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
            trackType={trackType}
            anchorEl={anchorEl}
            onClose={handleClose}
          />
        )}
      </>
    );
  }
);

AddClipButton.displayName = "AddClipButton";
