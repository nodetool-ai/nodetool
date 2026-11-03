/**
 * ShotActions
 *
 * Everything a creator can do to one shot from its media: edit, regenerate the
 * still, render a clip, upload a still, and the "Shot actions" menu (render,
 * continue from the previous shot's last frame, download, send to workflow,
 * duplicate, delete), together with the render and delete dialogs those open.
 *
 * Two places show it. The shot card puts it on its media as the hover row
 * ({@link ShotHoverToolbar}). The fullscreen gallery ({@link ShotMediaViewer})
 * puts it in its own toolbar for the shot on screen, so stepping through the
 * board in the viewer keeps the same actions the card has.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import type { Shot, VideoRef } from "@nodetool-ai/protocol";
import {
  resolveEffectiveProductionRequirement,
  shotRenderMode
} from "@nodetool-ai/protocol";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";

import {
  Box,
  Dialog,
  Text,
  ToolbarIconButton,
  UploadButton
} from "../ui_primitives";
import OpenRenderAsWorkflow from "./OpenRenderAsWorkflow";
import ShotHoverToolbar from "./ShotHoverToolbar";
import ShotRenderDialog, { type ShotRenderStep } from "./ShotRenderDialog";
import { isShotGenerating } from "./ShotStatusPill";
import { downloadResolvedMedia, shotDownloadName } from "./shotMediaDownload";
import { shotWorkflowMedia } from "./shotWorkflowMedia";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { sceneOrder } from "../../lib/storyboard/sceneOrder";
import { useBoardImageModel } from "../../hooks/storyboard/useShotCostEstimate";
import { priceRenderStep } from "../../hooks/storyboard/shotCostPricing";
import { STILL_RESOLUTION } from "../../hooks/storyboard/renderSpec";
import {
  useResolvedMedia,
  useResolvedMediaUri
} from "../../hooks/useResolvedMediaUri";
import { useAssetUpload } from "../../serverState/useAssetUpload";
import { useNotificationStore } from "../../stores/NotificationStore";
import { mediaRefFromAsset } from "../../utils/mediaRef";
import { captureLastFrame } from "./lastFrame";

/**
 * The clip a shot's card previews: the accepted clip, else the latest take, so
 * a rendered take can be seen before the creator accepts it. A shot that is a
 * still with motion graphics has none. A shot covered by another shot's clip
 * has no latest-take fallback: its takes are the ones a one take or scene
 * clip replaced, and the board preview plays its window instead.
 */
export const shotPreviewClip = (shot: Shot): VideoRef | undefined =>
  resolveEffectiveProductionRequirement(undefined, shot.production)
    ?.media_strategy === "still_motion_graphics"
    ? undefined
    : (shot.clip ?? (shot.covered_by ? undefined : shot.clip_versions?.at(-1)));

interface ShotActionsProps {
  boardId: string;
  shot: Shot;
  /** Hides every action that changes the board. */
  readOnly?: boolean;
  /**
   * `hover` is the card's row, shown under the pointer. `inline` sits in a
   * toolbar that is always visible, such as the fullscreen viewer's, which has
   * its own download for the item on screen.
   * @default "hover"
   */
  placement?: "hover" | "inline";
  /** Shows the drag grip; the card itself carries the drag. */
  showDragHandle?: boolean;
  /** Opens the fullscreen viewer. Omitted where there is nothing to open. */
  onFullscreen?: (event: React.SyntheticEvent) => void;
  /** Opens the shot's editor. Without it there is no edit action. */
  onEdit?: (shotId: string, focus: "fields" | "dialogue") => void;
  /** Called after the shot is deleted, for a surface that showed it. */
  onDeleted?: () => void;
}

/**
 * The dialogs sit wherever the actions do — inside a card, or inside the
 * viewer — so their clicks would bubble into that surface's handlers (select
 * the card, open the viewer) through the React tree.
 */
const swallowEvent = (event: React.SyntheticEvent): void => {
  event.stopPropagation();
};

const ShotActionsInner: React.FC<ShotActionsProps> = ({
  boardId,
  shot,
  readOnly,
  placement = "hover",
  showDragHandle,
  onFullscreen,
  onEdit,
  onDeleted
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const formatCost = (value: number): string =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      maximumSignificantDigits: 8
    }).format(value);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renderStep, setRenderStep] = useState<ShotRenderStep | null>(null);

  // The regenerate tooltip says what a still costs before its dialog opens:
  // the same per-step price the shot editor's cost line shows.
  const boardImageModel = useBoardImageModel(boardId);
  const stillCost = useMemo(
    () =>
      priceRenderStep(
        "Still",
        shot.still_model ?? boardImageModel,
        "still model",
        STILL_RESOLUTION,
        undefined,
        []
      ).cost,
    [shot.still_model, boardImageModel]
  );
  const duplicateShot = useStoryboardStore((state) => state.duplicateShot);
  const nudgeShot = useStoryboardStore((state) => state.nudgeShot);
  // Where the shot sits in its scene, for the menu's move items.
  const placeInScene = useStoryboardStore(
    useShallow((state) => {
      const shots = state.boards[boardId]?.shots ?? [];
      const group = sceneOrder(shots).find((g) =>
        g.shots.some((s) => s.id === shot.id)
      );
      const at = group ? group.shots.findIndex((s) => s.id === shot.id) : -1;
      return {
        first: at <= 0,
        last: !group || at === group.shots.length - 1
      };
    })
  );
  const removeShot = useStoryboardStore((state) => state.removeShot);
  const setShotKeyframe = useStoryboardStore((state) => state.setShotKeyframe);
  const setShotStatus = useStoryboardStore((state) => state.setShotStatus);
  // The clip the previous shot ends on, for continuing this shot from its
  // last frame. Null while that shot has no clip; unused on the first shot.
  const previousClip = useStoryboardStore(
    useCallback(
      (state) =>
        state.boards[boardId]?.shots.find((s) => s.index === shot.index - 1)
          ?.clip ?? null,
      [boardId, shot.index]
    )
  );
  const previousClipUri = useResolvedMediaUri(previousClip);
  const appendShotKeyframeVersion = useStoryboardStore(
    (state) => state.appendShotKeyframeVersion
  );
  const uploadAsset = useAssetUpload((state) => state.uploadAsset);

  const isGenerating = isShotGenerating(shot);
  // A keyframe shot animates its still, so its clip waits for one.
  const clipNeedsStill = shotRenderMode(shot) === "keyframe" && !shot.keyframe;
  // Download needs a URL, not a locator: the clip once there is one, the
  // selected still before that.
  const clipUri = useResolvedMediaUri(shotPreviewClip(shot));
  const keyframeUri = useResolvedMedia(shot.keyframe).url;
  const downloadUri = clipUri ?? keyframeUri;
  const downloadKind = clipUri ? "clip" : "still";
  const workflowMedia = useMemo(() => shotWorkflowMedia(shot), [shot]);
  const shotName = t("screens4_15.storyboard.shotCard.shotName", {
    number: new Intl.NumberFormat(locale).format(shot.index + 1),
    title: shot.slug ?? t("screens4_15.storyboard.shotCard.untitledShot")
  });

  const handleOpenDeleteConfirm = useCallback(() => setConfirmDelete(true), []);
  const handleCloseDeleteConfirm = useCallback(
    () => setConfirmDelete(false),
    []
  );
  const handleRenderStill = useCallback(() => setRenderStep("still"), []);
  const handleRenderClip = useCallback(() => setRenderStep("clip"), []);
  const handleCloseRender = useCallback(() => setRenderStep(null), []);

  const handleDownload = useCallback(() => {
    if (!downloadUri) {
      return;
    }
    void downloadResolvedMedia(
      downloadUri,
      shotDownloadName(shot.index, downloadKind, downloadUri)
    );
  }, [downloadUri, downloadKind, shot.index]);

  const handleDuplicate = useCallback(() => {
    duplicateShot(boardId, shot.id);
  }, [duplicateShot, boardId, shot.id]);

  const handleDeleteConfirmed = useCallback(() => {
    setConfirmDelete(false);
    removeShot(boardId, shot.id);
    onDeleted?.();
  }, [removeShot, boardId, shot.id, onDeleted]);

  const handleEdit = useCallback(
    () => onEdit?.(shot.id, "fields"),
    [onEdit, shot.id]
  );

  // An uploaded image becomes a candidate take. Current media changes only
  // when the creator explicitly accepts it in the takes gallery.
  const handleUpload = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) {
        return;
      }
      uploadAsset({
        file,
        onCompleted: (asset) =>
          appendShotKeyframeVersion(
            boardId,
            shot.id,
            mediaRefFromAsset(asset, "image")
          ),
        onFailed: (error) =>
          useNotificationStore.getState().addNotification({
            type: "error",
            alert: true,
            dismissable: true,
            content: t("screens4_15.storyboard.shotCard.uploadFailed", {
              error
            })
          })
      });
    },
    [uploadAsset, appendShotKeyframeVersion, boardId, shot.id, t]
  );

  // The previous shot's last frame becomes this shot's current still, so the
  // two clips cut on the same picture. Earlier stills stay as takes.
  const handleUseLastFrame = useCallback(() => {
    if (!previousClipUri) {
      return;
    }
    const reportFailure = (error: unknown): void =>
      useNotificationStore.getState().addNotification({
        type: "error",
        alert: true,
        dismissable: true,
        content: t("screens4_15.storyboard.shotCard.lastFrameFailed", {
          number: new Intl.NumberFormat(locale).format(shot.index + 1),
          error: error instanceof Error ? error.message : String(error)
        })
      });
    captureLastFrame(previousClipUri, `shot-${shot.index}-last-frame.png`)
      .then((file) =>
        uploadAsset({
          file,
          onCompleted: (asset) => {
            setShotKeyframe(
              boardId,
              shot.id,
              mediaRefFromAsset(asset, "image")
            );
            if (!shot.clip) {
              setShotStatus(boardId, shot.id, "keyframe_ready");
            }
          },
          onFailed: reportFailure
        })
      )
      .catch(reportFailure);
  }, [
    previousClipUri,
    t,
    locale,
    shot.index,
    shot.id,
    shot.clip,
    uploadAsset,
    setShotKeyframe,
    setShotStatus,
    boardId
  ]);

  return (
    <>
      <ShotHoverToolbar
        inline={placement === "inline"}
        showDragHandle={showDragHandle}
        onFullscreen={onFullscreen}
        fullscreenLabel={
          shotPreviewClip(shot)
            ? t("screens4_15.storyboard.shotCard.viewClipFullscreen")
            : t("screens4_15.storyboard.shotCard.viewStillFullscreen")
        }
        onRenderStill={readOnly ? undefined : handleRenderStill}
        onRenderClip={readOnly ? undefined : handleRenderClip}
        renderDisabled={isGenerating}
        onDownload={
          downloadUri && placement === "hover" ? handleDownload : undefined
        }
        downloadLabel={downloadKind}
        sendToWorkflowItems={workflowMedia}
        useLastFrame={
          readOnly || shot.index === 0
            ? undefined
            : {
                label: t("screens4_15.storyboard.shotCard.useLastFrame", {
                  number: new Intl.NumberFormat(locale).format(shot.index)
                }),
                disabled: isGenerating || !previousClipUri,
                onSelect: handleUseLastFrame
              }
        }
        onDuplicate={readOnly ? undefined : handleDuplicate}
        move={
          readOnly || (placeInScene.first && placeInScene.last)
            ? undefined
            : {
                earlierDisabled: placeInScene.first,
                laterDisabled: placeInScene.last,
                onEarlier: () => nudgeShot(boardId, shot.id, "up"),
                onLater: () => nudgeShot(boardId, shot.id, "down")
              }
        }
        onDelete={readOnly ? undefined : handleOpenDeleteConfirm}
      >
        {(shot.clip || shot.keyframe) && (
          <OpenRenderAsWorkflow
            record={(shot.clip ?? shot.keyframe)?.render_inputs}
          />
        )}
        {!readOnly && (
          <>
            {onEdit && (
              <ToolbarIconButton
                icon={<EditOutlinedIcon fontSize="inherit" />}
                tooltip={t("screens4_15.storyboard.shotCard.editShot")}
                ariaLabel={t("screens4_15.storyboard.shotCard.editShot")}
                onClick={handleEdit}
              />
            )}
            <ToolbarIconButton
              icon={<AutorenewIcon fontSize="inherit" />}
              tooltip={
                stillCost
                  ? t(
                      "screens4_15.storyboard.shotCard.regenerateStillPricedTooltip",
                      { cost: formatCost(stillCost) }
                    )
                  : t("screens4_15.storyboard.shotCard.regenerateStillTooltip")
              }
              ariaLabel={t("screens4_15.storyboard.shotCard.regenerateStill")}
              onClick={handleRenderStill}
              disabled={isGenerating}
            />
            <ToolbarIconButton
              icon={<MovieOutlinedIcon fontSize="inherit" />}
              tooltip={
                clipNeedsStill
                  ? t("screens4_15.storyboard.shotCard.renderStillFirst")
                  : t("screens4_15.storyboard.shotCard.renderClipTooltip")
              }
              ariaLabel={t("screens4_15.storyboard.shotCard.renderClip")}
              onClick={handleRenderClip}
              disabled={isGenerating || clipNeedsStill}
            />
            <UploadButton
              onFileSelect={handleUpload}
              tooltip={t("screens4_15.storyboard.shotCard.uploadStill")}
              accept="image/*"
              multiple={false}
            />
          </>
        )}
      </ShotHoverToolbar>

      <Box
        onClick={swallowEvent}
        onDoubleClick={swallowEvent}
        onKeyDown={swallowEvent}
        sx={{ display: "contents" }}
      >
        {/* Mounted only while open: it subscribes to both model catalogs. */}
        {renderStep && (
          <ShotRenderDialog
            boardId={boardId}
            shot={shot}
            step={renderStep}
            onClose={handleCloseRender}
          />
        )}

        <Dialog
          open={confirmDelete}
          onClose={handleCloseDeleteConfirm}
          title={t("screens4_15.storyboard.shotCard.deleteTitle")}
          onConfirm={handleDeleteConfirmed}
          confirmText={t("screens4_15.storyboard.shotCard.delete")}
          destructive
        >
          <Text>
            {t("screens4_15.storyboard.shotCard.deleteDescription", {
              shot: shotName
            })}
          </Text>
        </Dialog>
      </Box>
    </>
  );
};

export const ShotActions = memo(ShotActionsInner);
ShotActions.displayName = "ShotActions";

export default ShotActions;
