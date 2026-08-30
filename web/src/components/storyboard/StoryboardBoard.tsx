/**
 * StoryboardBoard
 *
 * A compact toolbar over a grid of {@link ShotCard}s. The toolbar carries the
 * board's name, a one-line summary, and the three actions that move the board
 * forward (render stills, render clips, assemble the timeline); the
 * Screenplay/Direction form — including *Direct* — folds into a collapsible
 * section behind *Board settings*, open by default while the board has no
 * shots. Selecting a card opens {@link ShotInspector} under the grid.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { shotRenderMode } from "@nodetool-ai/protocol";
import TuneIcon from "@mui/icons-material/Tune";

import {
  Box,
  Card,
  Caption,
  Collapse,
  Dialog,
  Divider,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  FormField,
  FormGrid,
  FormSection,
  LoadingSpinner,
  Panel,
  ScrollArea,
  SelectField,
  Skeleton,
  Text,
  TextInput,
  UndoRedoButtons,
  BORDER_RADIUS,
  CONTROL,
  SPACING
} from "../ui_primitives";
import {
  useBoard,
  useStoryboardStore,
  useStoryboardCanUndo,
  useStoryboardCanRedo
} from "../../stores/storyboard/StoryboardStore";
import { useGenerateShot } from "../../hooks/storyboard/useGenerateShot";
import { useStoryboardShotFocus } from "../../hooks/storyboard/useStoryboardShotFocus";
import {
  useImageModelsByProvider,
  type ImageModelTask
} from "../../hooks/useModelsByProvider";
import LanguageModelSelect from "../properties/LanguageModelSelect";
import { useInStudio } from "../../studio/StudioContext";
import ImageModelSelect from "../properties/ImageModelSelect";
import VideoModelSelect from "../properties/VideoModelSelect";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useEntities } from "../../serverState/useEntities";
import { exportStoryboardZip } from "../../utils/storyboardZip";
import ScriptLinkControl from "./ScriptLinkControl";
import ShotCard from "./ShotCard";
import ShotInspector from "./ShotInspector";
import StoryboardEntitiesField from "./StoryboardEntitiesField";

// The preview mounts the timeline compositor; keep it out of the board bundle.
const LazyStoryboardPreview = React.lazy(() => import("./StoryboardPreview"));

interface StoryboardBoardProps {
  boardId: string;
  readOnly?: boolean;
  /** Wired by the parent to a Director run; receives the requested shot count. */
  onDirect?: (shotCount: number) => void;
  /** True while a Director run is in flight (disables and relabels the button). */
  directing?: boolean;
  /** Error from the last Director run, shown under the header fields. */
  directError?: string | null;
  /** Wired by the parent to the timeline handoff. */
  onAssemble?: () => void;
  /** True while assembly is in flight. */
  assembling?: boolean;
  /** Error from the last assembly, shown under the header fields. */
  assembleError?: string | null;
}

const ASPECT_OPTIONS = [
  { value: "16:9", label: "16:9 — Widescreen" },
  { value: "9:16", label: "9:16 — Vertical" },
  { value: "1:1", label: "1:1 — Square" },
  { value: "4:3", label: "4:3 — Classic" },
  { value: "21:9", label: "21:9 — Cinematic" }
] as const;

const SHOT_COUNT_OPTIONS = [3, 4, 5, 6, 8, 10, 12].map((n) => ({
  value: n,
  label: `${n} shots`
}));

// Stills can come from a plain generator or an editing model; the latter can
// take entity reference images, so the picker offers both.
const STILL_MODEL_TASKS: ImageModelTask[] = ["text_to_image", "image_to_image"];

// The model pickers are custom buttons, not InputBase controls; hold them at
// the shared form-control height. Scoped to the picker's own class so no
// other button that ends up inside the field is affected.
const modelFieldSx = {
  "& .select-model-button": { minHeight: `${CONTROL.height.lg}px` }
} as const;

const FORM_STACK_BELOW = 860;

const settingsRailSx = {
  [`@media (min-width: ${FORM_STACK_BELOW + 1}px)`]: {
    paddingLeft: SPACING.xl,
    borderLeft: "1px solid",
    borderColor: "divider"
  }
} as const;

/** Four cards across at desktop width, down to one on a phone. */
const shotGridSx = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: SPACING.xl,
  alignItems: "start",
  "@media (max-width: 1280px)": {
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))"
  },
  "@media (max-width: 960px)": {
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
  },
  "@media (max-width: 600px)": {
    gridTemplateColumns: "minmax(0, 1fr)"
  }
} as const;

const StoryboardBoardInner: React.FC<StoryboardBoardProps> = ({
  boardId,
  readOnly,
  onDirect,
  directing,
  directError,
  onAssemble,
  assembling,
  assembleError
}) => {
  const {
    title,
    brief,
    style,
    entityIds,
    aspectRatio,
    directorModel,
    imageModel,
    videoModel,
    shots,
    activeShotId
  } = useBoard(boardId);

  // Land on the shot a script line or a cut clip linked to, once it has loaded.
  useStoryboardShotFocus(boardId);

  const inStudio = useInStudio();
  const setTitle = useStoryboardStore((state) => state.setTitle);
  const setBrief = useStoryboardStore((state) => state.setBrief);
  const setStyle = useStoryboardStore((state) => state.setStyle);
  const setAspectRatio = useStoryboardStore((state) => state.setAspectRatio);
  const setDirectorModel = useStoryboardStore((state) => state.setDirectorModel);
  const setImageModel = useStoryboardStore((state) => state.setImageModel);
  const setVideoModel = useStoryboardStore((state) => state.setVideoModel);
  const selectShot = useStoryboardStore((state) => state.selectShot);
  const undo = useStoryboardStore((state) => state.undo);
  const redo = useStoryboardStore((state) => state.redo);
  const canUndo = useStoryboardCanUndo(boardId);
  const canRedo = useStoryboardCanRedo(boardId);
  const onUndo = useCallback(() => undo(boardId), [undo, boardId]);
  const onRedo = useCallback(() => redo(boardId), [redo, boardId]);

  const [shotCount, setShotCount] = useState<number>(6);
  const [confirmRedirect, setConfirmRedirect] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const togglePreview = useCallback(() => setPreviewOpen((open) => !open), []);
  const [downloading, setDownloading] = useState(false);

  const hasShots = shots.length > 0;

  // A board with no shots is a board being set up: the form is the surface.
  // Once shots exist the grid is, and the form folds behind the toolbar.
  const [settingsOpen, setSettingsOpen] = useState(!hasShots);
  const toggleSettings = useCallback(
    () => setSettingsOpen((open) => !open),
    []
  );

  // Clicking the selected card deselects it (the card's aria-pressed
  // contract); the store's selectShot stays idempotent for programmatic
  // callers.
  const handleSelectShot = useCallback(
    (shotId: string) =>
      selectShot(boardId, shotId === activeShotId ? null : shotId),
    [selectShot, boardId, activeShotId]
  );
  const clearSelection = useCallback(
    () => selectShot(boardId, null),
    [selectShot, boardId]
  );
  const activeShotIndex = shots.findIndex((s) => s.id === activeShotId);
  const activeShot = activeShotIndex >= 0 ? shots[activeShotIndex] : undefined;

  // Entity reference images only reach generation through an editing model;
  // warn when entities are attached but the still model can't take them.
  const { models: imageModels } = useImageModelsByProvider();
  const stillModelDetails = imageModel?.id
    ? imageModels.find((m) => m.id === imageModel.id)
    : undefined;
  const entitiesNeedEditModel =
    entityIds.length > 0 &&
    !stillModelDetails?.supported_tasks?.includes("image_to_image");

  const runDirect = useCallback(() => {
    onDirect?.(shotCount);
  }, [onDirect, shotCount]);

  // Directing rewrites the whole screenplay, replacing every existing shot
  // (and its generated stills and clips). Confirm before clobbering work.
  const handleDirect = useCallback(() => {
    if (hasShots) {
      setConfirmRedirect(true);
      return;
    }
    runDirect();
  }, [hasShots, runDirect]);

  const handleConfirmRedirect = useCallback(() => {
    setConfirmRedirect(false);
    runDirect();
  }, [runDirect]);

  const hasRenderedShot = useMemo(
    () => shots.some((s) => s.status === "rendered" && !!s.clip?.asset_id),
    [shots]
  );

  // The preview plays clips and falls back to held keyframe stills, so any
  // shot carrying either asset is enough to have something to watch.
  const hasPlayableShot = useMemo(
    () => shots.some((s) => !!s.clip?.asset_id || !!s.keyframe?.asset_id),
    [shots]
  );

  const pendingStills = useMemo(
    () =>
      shots.filter(
        (s) => !s.keyframe && (s.status === "planned" || s.status === "failed")
      ),
    [shots]
  );

  const pendingClips = useMemo(
    () =>
      shots.filter(
        (s) =>
          (!!s.keyframe || shotRenderMode(s) === "direct") &&
          !s.clip &&
          s.status !== "keyframe_generating" &&
          s.status !== "clip_generating"
      ),
    [shots]
  );

  // The toolbar's one-line summary: how big the board is, how it looks, and
  // who is in it — the fields the folded form would otherwise hide.
  const { data: allEntities } = useEntities();
  const summary = useMemo(() => {
    const entityNames = (allEntities ?? [])
      .filter((e) => entityIds.includes(e.id))
      .map((e) => e.name)
      .filter((name): name is string => !!name);
    return [
      `${shots.length} shot${shots.length === 1 ? "" : "s"}`,
      style.trim().length > 0 ? `${style.trim()} style` : null,
      entityNames.length > 0 ? `entity: ${entityNames.join(", ")}` : null
    ]
      .filter((part): part is string => part !== null)
      .join(" · ");
  }, [shots.length, style, entityIds, allEntities]);

  const { generateKeyframe, generateClip } = useGenerateShot();
  // A shot that cannot start records the reason on itself (its card shows it,
  // and it is toasted), so one failure must not stop the rest of the batch.
  const handleGenerateAllStills = useCallback(() => {
    for (const shot of pendingStills) {
      void generateKeyframe(boardId, shot).catch(() => undefined);
    }
  }, [pendingStills, generateKeyframe, boardId]);
  const handleGenerateAllClips = useCallback(() => {
    for (const shot of pendingClips) {
      void generateClip(boardId, shot).catch(() => undefined);
    }
  }, [pendingClips, generateClip, boardId]);

  // The archive is packed server-side from the saved board, so a download
  // shows what the server holds — the local edits an in-flight save has not
  // reached it with yet are not in the zip.
  const handleDownloadZip = useCallback(() => {
    setDownloading(true);
    exportStoryboardZip(boardId, title || "storyboard")
      .catch((error: unknown) => {
        useNotificationStore.getState().addNotification({
          type: "error",
          alert: true,
          dismissable: true,
          content: `Storyboard download failed. ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      })
      .finally(() => setDownloading(false));
  }, [boardId, title]);

  return (
    <ScrollArea fullHeight thin className="storyboard-board">
      <FlexColumn
        gap={SPACING.lg}
        sx={{
          p: SPACING.xl,
          "@media (max-width: 600px)": {
            p: SPACING.md,
            gap: SPACING.md
          }
        }}
      >
        <FlexRow align="center" gap={SPACING.lg} wrap>
          <Text size="big">{title || "Untitled film"}</Text>
          <Caption color="secondary">{summary}</Caption>
          <Box sx={{ flex: 1 }} />
          {!readOnly && (
            <FlexRow align="center" gap={SPACING.md} wrap>
              <UndoRedoButtons
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={onUndo}
                onRedo={onRedo}
                undoTooltip="Undo (⌘Z)"
                redoTooltip="Redo (⌘⇧Z)"
              />
              <ScriptLinkControl boardId={boardId} disabled={directing} />
              <EditorButton
                variant="outlined"
                onClick={togglePreview}
                disabled={!hasPlayableShot}
              >
                {previewOpen ? "Hide preview" : "Preview"}
              </EditorButton>
              <EditorButton
                variant="outlined"
                onClick={handleDownloadZip}
                disabled={!hasShots || downloading}
              >
                {downloading ? "Preparing…" : "Download ZIP"}
              </EditorButton>
              <EditorButton
                variant="outlined"
                startIcon={<TuneIcon fontSize="small" />}
                onClick={toggleSettings}
                aria-expanded={settingsOpen}
              >
                Board settings
              </EditorButton>
              <EditorButton
                variant="outlined"
                onClick={handleGenerateAllStills}
                disabled={pendingStills.length === 0 || directing}
              >
                {`Render stills${pendingStills.length > 0 ? ` (${pendingStills.length})` : ""}`}
              </EditorButton>
              <EditorButton
                variant="outlined"
                onClick={handleGenerateAllClips}
                disabled={pendingClips.length === 0 || directing}
              >
                {`Render clips${pendingClips.length > 0 ? ` (${pendingClips.length})` : ""}`}
              </EditorButton>
              <EditorButton
                variant="contained"
                color="primary"
                onClick={onAssemble}
                disabled={!onAssemble || assembling || !hasRenderedShot}
              >
                {assembling ? "Assembling…" : "Assemble timeline"}
              </EditorButton>
            </FlexRow>
          )}
        </FlexRow>

        {!readOnly && (
          <Collapse in={settingsOpen} timeout="auto" unmountOnExit>
            <Panel padding={SPACING.xl} sx={{ maxWidth: "1100px" }}>
              <FlexColumn gap={SPACING.xl}>
                <FormGrid stackBelow={FORM_STACK_BELOW}>
                  <FormSection label="Screenplay">
                    <FormField label="Title">
                      <TextInput
                        value={title}
                        placeholder="Untitled film"
                        onChange={(e) => setTitle(boardId, e.target.value)}
                      />
                    </FormField>
                    <FormField label="Brief">
                      <TextInput
                        value={brief}
                        placeholder="Your film in one or two sentences"
                        onChange={(e) => setBrief(boardId, e.target.value)}
                        multiline
                        rows={3}
                      />
                    </FormField>
                    <FormField label="Style">
                      <TextInput
                        value={style}
                        placeholder="Palette, light, lens, texture"
                        onChange={(e) => setStyle(boardId, e.target.value)}
                      />
                    </FormField>
                    <FormField label="Entities">
                      <StoryboardEntitiesField
                        boardId={boardId}
                        entityIds={entityIds}
                      />
                    </FormField>
                  </FormSection>

                  <FormSection label="Direction" sx={settingsRailSx}>
                    {/* The Studio shell pins the director model — a beginner
                        picks what the film looks like, not which LLM writes it. */}
                    {!inStudio && (
                      <FormField label="Screenplay model" sx={modelFieldSx}>
                        <LanguageModelSelect
                          value={directorModel?.id ?? ""}
                          onChange={(value) => setDirectorModel(boardId, value)}
                        />
                      </FormField>
                    )}
                    <FormField label="Still model" sx={modelFieldSx}>
                      <ImageModelSelect
                        value={imageModel?.id ?? ""}
                        task={STILL_MODEL_TASKS}
                        onChange={(value) => setImageModel(boardId, value)}
                      />
                      {entitiesNeedEditModel && (
                        <Caption color="warning">
                          Entities carry reference images, but this model only
                          takes text. Pick an image-to-image model to use them.
                        </Caption>
                      )}
                    </FormField>
                    <FormField label="Clip model" sx={modelFieldSx}>
                      <VideoModelSelect
                        value={videoModel?.id ?? ""}
                        task="image_to_video"
                        onChange={(value) => setVideoModel(boardId, value)}
                      />
                    </FormField>
                    <FormField label="Aspect ratio">
                      <SelectField
                        label="Aspect ratio"
                        value={aspectRatio}
                        onChange={(value) => setAspectRatio(boardId, value)}
                        options={ASPECT_OPTIONS}
                      />
                    </FormField>
                    <FormField label="Shots">
                      <SelectField
                        label="Shots"
                        value={shotCount}
                        onChange={(value) => setShotCount(Number(value))}
                        options={SHOT_COUNT_OPTIONS}
                      />
                    </FormField>
                  </FormSection>
                </FormGrid>

                <Divider />

                <FlexRow
                  gap={SPACING.md}
                  align="center"
                  justify="space-between"
                  wrap
                >
                  <Caption
                    color={directError || assembleError ? "error" : "secondary"}
                  >
                    {directError ??
                      assembleError ??
                      (hasShots
                        ? "Re-directing rewrites the screenplay and replaces every shot."
                        : "Direct writes the screenplay and seeds your shots.")}
                  </Caption>
                  <EditorButton
                    variant="contained"
                    color="primary"
                    onClick={handleDirect}
                    disabled={!onDirect || directing}
                  >
                    {directing
                      ? "Directing…"
                      : hasShots
                        ? "Re-direct"
                        : "Direct"}
                  </EditorButton>
                </FlexRow>
              </FlexColumn>
            </Panel>
          </Collapse>
        )}

        <Dialog
          open={confirmRedirect}
          onClose={() => setConfirmRedirect(false)}
          title="Re-direct this storyboard?"
          onConfirm={handleConfirmRedirect}
          confirmText="Re-direct"
          destructive
        >
          <FlexColumn gap={SPACING.xs}>
            <Text>
              {`Directing writes a new screenplay and replaces all ${shots.length} current shot${shots.length === 1 ? "" : "s"}.`}
            </Text>
            <Caption color="secondary">
              Generated stills and clips stay in your asset library, but the
              shots on this board are rebuilt from scratch.
            </Caption>
          </FlexColumn>
        </Dialog>

        {previewOpen && (
          <React.Suspense
            fallback={<LoadingSpinner size="small" text="Loading preview" />}
          >
            <LazyStoryboardPreview boardId={boardId} />
          </React.Suspense>
        )}

        {directing ? (
          <FlexColumn gap={SPACING.md}>
            <Caption color="primary">
              The director is writing your screenplay.
            </Caption>
            <Box sx={shotGridSx}>
              {Array.from({ length: shotCount }).map((_, i) => (
                <Card key={i} variant="outlined" padding="none">
                  <Skeleton
                    variant="rectangular"
                    animation="wave"
                    sx={{
                      width: "100%",
                      aspectRatio: "16 / 9",
                      height: "auto",
                      borderRadius: BORDER_RADIUS.lg
                    }}
                  />
                  <FlexColumn gap={SPACING.xs} sx={{ p: SPACING.lg }}>
                    <Skeleton preset="text" width="85%" />
                    <Skeleton preset="text" width="60%" />
                  </FlexColumn>
                </Card>
              ))}
            </Box>
          </FlexColumn>
        ) : shots.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No shots yet"
            description={
              readOnly
                ? "This storyboard has no shots."
                : "Write a brief and press Direct to generate a screenplay of shots."
            }
          />
        ) : (
          <Box sx={shotGridSx}>
            {shots.map((shot) => (
              <ShotCard
                key={shot.id}
                boardId={boardId}
                shot={shot}
                selected={shot.id === activeShotId}
                onSelect={handleSelectShot}
              />
            ))}
          </Box>
        )}

        {activeShot && (
          <ShotInspector
            key={activeShot.id}
            boardId={boardId}
            shot={activeShot}
            readOnly={readOnly}
            isFirst={activeShotIndex === 0}
            isLast={activeShotIndex === shots.length - 1}
            onClose={clearSelection}
          />
        )}
      </FlexColumn>
    </ScrollArea>
  );
};

export const StoryboardBoard = memo(StoryboardBoardInner);
StoryboardBoard.displayName = "StoryboardBoard";

export default StoryboardBoard;
