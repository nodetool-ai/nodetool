/**
 * Blockout rows of the 3D section: the reference render and the shot link.
 *
 * A reference is a grey video of the clip's span, drawn with a fixed light on
 * an opaque neutral background whatever the clip's own lighting and background
 * are. A video model that takes reference video follows its camera and
 * staging when a take of the linked shot is generated. The rows pick the pass,
 * start and cancel the render, say when the stored reference no longer matches
 * the clip, play it, and link the clip to a shot whose clip it overlaps.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import type { Model3DReferencePass, TimelineClip } from "@nodetool-ai/timeline";
import {
  DEFAULT_MODEL3D_REFERENCE_PASS,
  MODEL3D_REFERENCE_PASSES,
  isModel3DReferencePass,
  model3dReferenceStatus,
  shotClipCandidatesForBlockout
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  blockoutReferenceKey,
  useBlockoutReferenceStore
} from "../../../stores/timeline/BlockoutReferenceStore";
import { useBlockoutReference } from "../../../hooks/timeline/useBlockoutReference";
import { useBlockoutLink } from "../../../hooks/timeline/useBlockoutLink";
import ErrorBanner from "../../support/ErrorBanner";
import {
  Button,
  ButtonSpinner,
  Caption,
  Chip,
  FlexColumn,
  FlexRow,
  SPACING,
  VideoPlayer
} from "../../ui_primitives";
import { InspectorRow, InspectorSelect } from "./InspectorPrimitives";

/** The picker value of a clip linked to no shot. */
const NO_SHOT = "";

const shotValue = (boardId: string, shotId: string): string =>
  `${boardId}:${shotId}`;

export interface BlockoutReferenceSectionProps {
  clip: TimelineClip;
}

export const BlockoutReferenceSection: React.FC<BlockoutReferenceSectionProps> =
  memo(({ clip }) => {
    const { t } = useTranslation();
    const { renderReference, cancel } = useBlockoutReference();
    const linkBlockout = useBlockoutLink();
    const sequence = useTimelineStore(
      useShallow((s) => ({ fps: s.fps, width: s.width, height: s.height }))
    );
    const key = useTimelineStore((s) =>
      blockoutReferenceKey(s.sequenceId, clip.id)
    );
    const render = useBlockoutReferenceStore((s) => s.renders[key]);
    const error = useBlockoutReferenceStore((s) => s.errors[key]);
    const shotClips = useTimelineStore(
      useShallow((s) => shotClipCandidatesForBlockout(s.clips, clip))
    );

    const reference = clip.model3dStyle?.reference;
    const [pickedPass, setPickedPass] = useState<Model3DReferencePass | null>(
      null
    );
    const pass = pickedPass ?? reference?.pass ?? DEFAULT_MODEL3D_REFERENCE_PASS;
    const [playing, setPlaying] = useState(false);

    // "stale" covers an edit to the clip and a pass other than the stored one.
    const status = model3dReferenceStatus(clip, sequence, pass);
    const rendering = render !== undefined;
    const clipId = clip.id;

    const handlePassChange = useCallback((value: string) => {
      if (isModel3DReferencePass(value)) {
        setPickedPass(value);
      }
    }, []);
    const handleRender = useCallback(() => {
      // The failure is held in the store for the banner below.
      void renderReference(clipId, pass).catch(() => undefined);
    }, [renderReference, clipId, pass]);
    const handleCancel = useCallback(() => cancel(clipId), [cancel, clipId]);
    const togglePlaying = useCallback(() => setPlaying((on) => !on), []);

    const passOptions = useMemo(
      () =>
        MODEL3D_REFERENCE_PASSES.map((id) => ({
          value: id,
          label: t(`blockout3d.pass.${id}.label`)
        })),
      [t]
    );

    const linkedValue =
      clip.storyboardBoardId && clip.storyboardShotId
        ? shotValue(clip.storyboardBoardId, clip.storyboardShotId)
        : NO_SHOT;
    const shotOptions = useMemo(() => {
      const options = [
        { value: NO_SHOT, label: t("blockout3d.shot.none") },
        ...shotClips.map((shotClip) => ({
          value: shotValue(
            shotClip.storyboardBoardId ?? "",
            shotClip.storyboardShotId ?? ""
          ),
          label: shotClip.name
        }))
      ];
      // A link whose shot clip no longer overlaps stays in the list, so the
      // picker shows what is stored.
      if (!options.some((option) => option.value === linkedValue)) {
        options.push({
          value: linkedValue,
          label: t("blockout3d.shot.elsewhere")
        });
      }
      return options;
    }, [shotClips, linkedValue, t]);
    const handleShotChange = useCallback(
      (value: string) => {
        const target = shotClips.find(
          (shotClip) =>
            shotValue(
              shotClip.storyboardBoardId ?? "",
              shotClip.storyboardShotId ?? ""
            ) === value
        );
        linkBlockout(
          clipId,
          target?.storyboardBoardId && target.storyboardShotId
            ? {
                boardId: target.storyboardBoardId,
                shotId: target.storyboardShotId
              }
            : null
        );
      },
      [shotClips, linkBlockout, clipId]
    );

    const progress = render?.progress;
    return (
      <>
        <InspectorRow label={t("blockout3d.reference.label")}>
          <FlexColumn gap={SPACING.xs} sx={{ minWidth: 0 }}>
            <InspectorSelect
              label={t("blockout3d.reference.pass")}
              value={pass}
              options={passOptions}
              onChange={handlePassChange}
              disabled={rendering}
            />
            <FlexRow gap={SPACING.sm} wrap align="center">
              <Button
                size="small"
                variant="outlined"
                onClick={rendering ? handleCancel : handleRender}
                // Rendering turns the button into Cancel, so it stays enabled.
                startIcon={rendering ? <ButtonSpinner /> : undefined}
                disabled={!rendering && !clip.currentAssetId}
                data-testid="blockout-render-reference"
              >
                {rendering
                  ? progress && progress.total > 0
                    ? t("blockout3d.reference.cancelProgress", progress)
                    : t("blockout3d.reference.cancel")
                  : status === "missing"
                    ? t("blockout3d.reference.render")
                    : t("blockout3d.reference.renderAgain")}
              </Button>
              {reference && !rendering && (
                <Button
                  size="small"
                  variant="text"
                  onClick={togglePlaying}
                  aria-expanded={playing}
                  data-testid="blockout-play-reference"
                >
                  {playing
                    ? t("blockout3d.reference.hide")
                    : t("blockout3d.reference.play")}
                </Button>
              )}
            </FlexRow>
            {status === "stale" && !rendering && (
              <Chip
                compact
                color="warning"
                label={t("blockout3d.reference.stale")}
              />
            )}
          </FlexColumn>
        </InspectorRow>
        <Caption color="muted">{t(`blockout3d.pass.${pass}.hint`)}</Caption>
        {reference && playing && !rendering && (
          <VideoPlayer
            locator={{ asset_id: reference.assetId }}
            label={t("blockout3d.reference.playerLabel")}
          />
        )}
        {error && (
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: t("blockout3d.reference.failed"),
              errorText: error
            }}
          >
            {error}
          </ErrorBanner>
        )}
        <InspectorRow label={t("blockout3d.shot.label")}>
          <InspectorSelect
            label={t("blockout3d.shot.pickerLabel")}
            value={linkedValue}
            options={shotOptions}
            onChange={handleShotChange}
            disabled={clip.locked}
            grow
          />
        </InspectorRow>
        <Caption color="muted">
          {shotClips.length === 0 && linkedValue === NO_SHOT
            ? t("blockout3d.shot.noCandidates")
            : t("blockout3d.shot.help")}
        </Caption>
      </>
    );
  });
BlockoutReferenceSection.displayName = "BlockoutReferenceSection";
