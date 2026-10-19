/**
 * Step 1 of the video flow — the idea (PRD § 8.1).
 *
 * One sentence, written straight onto the sequence's `setup.brief` as it is
 * typed, so `Continue` has only the stage left to write and a reload resumes
 * with the text intact (D1, D3).
 *
 * The three alternatives are the ways in that skip the writing: bring footage
 * you already have, start from a script, or open an empty timeline. Dropping
 * media places clips before any beat exists (criterion 1) — the plan then
 * describes the footage rather than inventing shots over it.
 *
 * The card is named "Drop your media", so the step is a drop target as well as
 * a picker: files dropped anywhere on it are imported in drop order. What
 * landed and what could not be placed is listed afterwards, and footage
 * dropped with no brief keeps the creator here, because step 2 ends in a
 * planner that refuses an empty one.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";

import {
  AlertBanner,
  BORDER_RADIUS,
  Box,
  Caption,
  Chip,
  DropZone,
  FlexColumn,
  FlexRow,
  GAP,
  getSpacingPx,
  ResponsiveImage,
  Text,
  TextArea
} from "../../ui_primitives";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useExampleStoryboards } from "../../../hooks/storyboard/useStoryboards";
import { useEntities } from "../../../serverState/useEntities";
import { useSetupMediaImport } from "../../../hooks/timeline/useSetupMediaImport";
import type { SetupMediaImportResult } from "../../../hooks/timeline/useSetupMediaImport";
import { assetIdFromLocator } from "../../../utils/mediaRef";
import ReportBugButton from "../../support/ReportBugButton";
import ErrorBanner from "../../support/ErrorBanner";
import { ExampleBriefs } from "../ExampleBriefs";
import { GalleryFrame } from "../MediaGallery";
import { AlternativesColumn } from "../AlternativesColumn";
import type { AlternativeEntry } from "../AlternativesColumn";
import { useVideoSetupContext } from "./setupContext";
import CreativeContextFields from "./CreativeContextFields";

/** How wide a carried reference thumbnail is drawn. */
const REFERENCE_THUMBNAIL = getSpacingPx(12);

/** How many example loglines are offered as inspiration (PRD § 8.1). */
const INSPIRATION_COUNT = 3;

/** What the media picker takes: the three kinds a timeline track can hold. */
export const MEDIA_ACCEPT = "video/*,audio/*,image/*";

/** The same three kinds, for files that arrive by drop rather than by picker. */
const isMediaFile = (file: File): boolean =>
  /^(video|audio|image)\//.test(file.type);

export interface IdeaStepProps {
  /** Opens an empty timeline — the flow's escape hatch, stage `done`. */
  onStartBlank: () => void;
  /**
   * Hands the brief to the script flow (E3), which sends it back finished.
   * Absent on a host that cannot open a script: the card is then offered
   * disabled with the reason, never enabled with nothing behind it.
   */
  onStartFromScript?: () => void;
  onValidationChange?: (reason: string | undefined) => void;
  /**
   * Reports an upload in progress, so the flow can hold `Continue` until the
   * dropped media is placed. A late upload otherwise lands after the stage
   * moved and the plan is drafted without it.
   */
  onImportingChange?: (importing: boolean) => void;
  /**
   * The step cannot change the draft: a run is pending or Change flow is
   * discarding it. The fieldset disables the controls, not a drop.
   */
  readOnly?: boolean;
}

const IdeaStepInternal: React.FC<IdeaStepProps> = ({
  onStartBlank,
  onStartFromScript,
  onValidationChange,
  onImportingChange,
  readOnly = false
}) => {
  const { t } = useTranslation();
  const brief = useTimelineStore((state) => state.setup?.brief ?? "");
  const setSetup = useTimelineStore((state) => state.setSetup);
  const { importFiles, importing } = useSetupMediaImport();
  // Placed media lives on this draft, which the script hand-off discards.
  const hasPlacedMedia = useTimelineStore((state) => state.clips.length > 0);
  const [error, setError] = useState<string | null>(null);
  // Whether `error` is a failed import rather than a hint about the drop.
  const [importFailed, setImportFailed] = useState(false);
  const [imported, setImported] = useState<SetupMediaImportResult | null>(null);
  // Dropped files that are not media, by name. The picker cannot offer them,
  // so only a drop fills this.
  const [rejected, setRejected] = useState<string[]>([]);
  // `importing` is state, so two drops in one tick both read false. The ref
  // closes that gap.
  const importingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const mediaInput = useRef<HTMLInputElement>(null);
  const briefField = useRef<HTMLElement | null>(null);
  const { data: examples } = useExampleStoryboards();
  // What the project composer was holding when the Video card was clicked
  // (F4). Shown so the creator can see it arrived rather than guessing.
  const { references, entityIds, creativeContext } = useVideoSetupContext();
  const { data: entities } = useEntities();
  const carriedEntities = useMemo(
    () => (entities ?? []).filter((entity) => entityIds.includes(entity.id)),
    [entities, entityIds]
  );

  const handleChange = useCallback(
    (value: string) => {
      setSetup({ brief: value });
    },
    [setSetup]
  );

  useEffect(() => {
    onImportingChange?.(importing);
  }, [importing, onImportingChange]);
  useEffect(() => () => onImportingChange?.(false), [onImportingChange]);

  const runImport = useCallback(
    async (files: readonly File[], notMedia: string[] = []) => {
      if (files.length === 0 || importingRef.current) {
        return;
      }
      importingRef.current = true;
      setError(null);
      setImportFailed(false);
      setRejected(notMedia);
      try {
        // Drop order is the cut order, so the files are uploaded and placed in
        // the order they arrived.
        const result = await importFiles(files);
        setImported(result);
        if (!result.advanced) {
          briefField.current?.focus();
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setImportFailed(true);
      } finally {
        importingRef.current = false;
      }
    },
    [importFiles]
  );

  const handlePicked = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      await runImport(files);
    },
    [runImport]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      if (readOnly || !Array.from(event.dataTransfer.types).includes("Files")) {
        return;
      }
      event.preventDefault();
      setDragging(true);
    },
    [readOnly]
  );

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) {
        return;
      }
      event.preventDefault();
      setDragging(false);
      if (readOnly) {
        return;
      }
      if (importing || importingRef.current) {
        setImportFailed(false);
        setError(t("pass3_12.video.idea.errors.uploadInProgress"));
        return;
      }
      const media = files.filter(isMediaFile);
      const notMedia = files
        .filter((file) => !isMediaFile(file))
        .map((file) => file.name);
      if (media.length === 0) {
        setImportFailed(false);
        setError(
          t("pass3_12.video.idea.errors.unsupportedFiles", {
            files: notMedia.join(" · ")
          })
        );
        return;
      }
      await runImport(media, notMedia);
    },
    [importing, readOnly, runImport, t]
  );

  const skippedNames = useMemo(
    () => [
      ...rejected,
      ...(imported?.skipped ?? []).map((asset) => asset.name)
    ],
    [imported, rejected]
  );

  // The shipped boards carry briefs that work as video setup prompts. Timeline
  // examples are finished edits and do not carry those source prompts.
  const inspirations = useMemo(
    () =>
      (examples ?? [])
        .map((example) => example.logline.trim())
        .filter((logline) => logline.length > 0)
        .slice(0, INSPIRATION_COUNT),
    [examples]
  );

  const alternatives: AlternativeEntry[] = useMemo(
    () => [
      {
        id: "media",
        title: t("pass3_12.video.idea.alternatives.media.title"),
        description: t("pass3_12.video.idea.alternatives.media.description"),
        onSelect: () => mediaInput.current?.click(),
        disabled: importing,
        disabledReason: importing
          ? t("pass3_12.video.idea.alternatives.uploading")
          : undefined
      },
      {
        id: "script",
        title: t("pass3_12.video.idea.alternatives.script.title"),
        description: t("pass3_12.video.idea.alternatives.script.description"),
        onSelect: onStartFromScript ?? (() => undefined),
        // Leaving the flow mid-upload would drop the media still arriving,
        // and leaving after it would drop the clips it placed.
        disabled: !onStartFromScript || importing || hasPlacedMedia,
        disabledReason: !onStartFromScript
          ? t("pass3_12.video.idea.alternatives.scriptUnavailable")
          : importing
            ? t("pass3_12.video.idea.errors.uploadPendingReason")
            : hasPlacedMedia
              ? t("pass3_12.video.idea.alternatives.scriptMediaWouldBeLeft")
              : undefined
      },
      {
        id: "blank",
        title: t("pass3_12.video.idea.alternatives.blank.title"),
        description: t("pass3_12.video.idea.alternatives.blank.description"),
        onSelect: onStartBlank,
        disabled: importing,
        disabledReason: importing
          ? t("pass3_12.video.idea.errors.uploadPendingReason")
          : undefined
      }
    ],
    [hasPlacedMedia, importing, onStartBlank, onStartFromScript, t]
  );

  return (
    <DropZone
      overlay
      over={dragging}
      overlayLabel={t("pass3_12.video.idea.dropOverlayLabel")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          md: `minmax(0, 2fr) minmax(${getSpacingPx(60)}, 1fr)`
        },
        gap: GAP.spacious,
        alignItems: "start"
      }}
    >
      <FlexColumn gap={GAP.comfortable}>
        <FlexColumn gap={GAP.tight}>
          <Text size="big" component="h2">
            {t("pass3_12.video.idea.title")}
          </Text>
          <Text size="normal" color="secondary">
            {t("pass3_12.video.idea.description")}
          </Text>
        </FlexColumn>

        <TextArea
          value={brief}
          autoFocus
          rows={4}
          label={t("pass3_12.video.idea.briefLabel")}
          hideLabel
          placeholder={t("pass3_12.video.idea.briefPlaceholder")}
          onChange={handleChange}
          inputRef={briefField}
        />

        <CreativeContextFields
          value={creativeContext}
          onValidationChange={onValidationChange}
          onChange={(value) => setSetup({ creative_context: value })}
        />

        {dragging ? (
          <Caption color="secondary" role="status">
            {t("pass3_12.video.idea.dropStatus")}
          </Caption>
        ) : null}

        {error ? (
          <AlertBanner severity="error" onClose={() => setError(null)}>
            <FlexRow gap={GAP.normal} align="center" wrap>
              <Text size="normal" component="span">
                {error}
              </Text>
              {importFailed ? (
                <ReportBugButton
                  context={{
                    source: "operation-failure",
                    summary: t("pass3_12.video.idea.importReportSummary"),
                    errorText: error
                  }}
                />
              ) : null}
            </FlexRow>
          </AlertBanner>
        ) : null}

        {imported ? (
          <AlertBanner
            severity={
              imported.failed.length > 0
                ? "error"
                : skippedNames.length > 0
                  ? "warning"
                  : "info"
            }
            onClose={() => setImported(null)}
          >
            <FlexColumn gap={GAP.micro}>
              <Text size="normal" component="span">
                {t("pass3_12.video.idea.import.placed", {
                  count: imported.placed.length,
                  continuation: imported.advanced
                    ? ""
                    : t("pass3_12.video.idea.import.briefPrompt")
                })}
              </Text>
              {imported.placed.length > 0 ? (
                <Caption component="span" color="secondary">
                  {imported.placed.map((asset) => asset.name).join(" · ")}
                </Caption>
              ) : null}
              {imported.failed.length > 0 ? (
                <ErrorBanner
                  report={{
                    source: "operation-failure",
                    summary: t("pass3_12.video.idea.uploadReportSummary"),
                    errorText: imported.failed
                      .map((failure) => `${failure.name}: ${failure.reason}`)
                      .join("\n")
                  }}
                >
                  {imported.failed.map((failure) => (
                    <div key={failure.name}>
                      {t("pass3_12.video.idea.import.fileFailed", {
                        name: failure.name,
                        reason: failure.reason
                      })}
                    </div>
                  ))}
                </ErrorBanner>
              ) : null}
              {skippedNames.length > 0 ? (
                <Caption component="span" color="secondary">
                  {t("pass3_12.video.idea.import.skippedFiles", {
                    files: skippedNames.join(" · ")
                  })}
                </Caption>
              ) : null}
            </FlexColumn>
          </AlertBanner>
        ) : null}

        {references.length > 0 || entityIds.length > 0 ? (
          <FlexColumn
            gap={GAP.tight}
            role="group"
            aria-label={t("pass3_12.video.idea.carriedReferencesGroup")}
          >
            <Caption color="muted">
              {t("pass3_12.video.idea.fromProjectScreen")}
            </Caption>
            {references.length > 0 ? (
              <FlexRow gap={GAP.tight} wrap>
                {references.map((reference) => {
                  const assetId = assetIdFromLocator(reference.uri);
                  const binding = creativeContext?.reference_bindings?.find(
                    (candidate) => candidate.asset_id === assetId
                  );
                  return (
                    <FlexColumn key={reference.uri} gap={GAP.micro}>
                      <GalleryFrame
                        locator={reference.uri}
                        kind="image"
                        caption={reference.name ?? undefined}
                        label={
                          reference.name ??
                          t("pass3_12.video.idea.referenceImage")
                        }
                      >
                        <ResponsiveImage
                          locator={reference.uri}
                          preferThumbnail
                          alt={
                            reference.name ??
                            t("pass3_12.video.idea.referenceImage")
                          }
                          fit="cover"
                          borderRadius={BORDER_RADIUS.sm}
                          showErrorFallback
                          sx={{
                            width: REFERENCE_THUMBNAIL,
                            height: REFERENCE_THUMBNAIL
                          }}
                        />
                      </GalleryFrame>
                      <Caption color="secondary">
                        {binding
                          ? t("pass3_12.video.idea.referenceConditioning", {
                              kind: t(
                                `pass3_12.video.creativeContext.referenceKinds.${binding.kind}`
                              )
                            })
                          : t("pass3_12.video.idea.inspirationOnly")}
                      </Caption>
                    </FlexColumn>
                  );
                })}
              </FlexRow>
            ) : null}
            {carriedEntities.length > 0 ? (
              <FlexRow gap={GAP.tight} wrap>
                {carriedEntities.map((entity) => {
                  const kind = creativeContext?.reference_bindings?.find(
                    (binding) => binding.entity_id === entity.id
                  )?.kind;
                  return (
                    <Chip
                      key={entity.id}
                      label={`${entity.name} · ${
                        kind
                          ? t(
                              `pass3_12.video.creativeContext.referenceKinds.${kind}`
                            )
                          : t("pass3_12.video.idea.inspirationOnly")
                      }`}
                      size="small"
                    />
                  );
                })}
              </FlexRow>
            ) : null}
          </FlexColumn>
        ) : null}

        <ExampleBriefs
          examples={inspirations}
          brief={brief}
          onSelect={(value) => setSetup({ brief: value })}
          briefRef={briefField}
        />
      </FlexColumn>

      <AlternativesColumn
        label={t("pass3_12.video.idea.otherWaysToStart")}
        alternatives={alternatives}
      />

      {/* The card is the control; this input only opens the picker. */}
      <input
        type="file"
        hidden
        multiple
        ref={mediaInput}
        accept={MEDIA_ACCEPT}
        aria-label={t("pass3_12.video.idea.mediaPickerLabel")}
        onChange={handlePicked}
      />
    </DropZone>
  );
};

export const IdeaStep = memo(IdeaStepInternal);
IdeaStep.displayName = "VideoIdeaStep";

export default IdeaStep;
