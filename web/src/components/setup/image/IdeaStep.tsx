/**
 * Step 1 of the image flow — the idea (PRD § 10.1).
 *
 * The brief is written straight onto the document as it is typed, so
 * `Continue` has only the stage left to write and a reload resumes with the
 * text intact (D1, D3).
 *
 * Both alternatives land in the same place — stage `done` and the editor —
 * because neither has a brief to refine: an upload is already the picture, and
 * a blank canvas is the creator saying they will paint it themselves.
 */

import React, { memo, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertBanner,
  BORDER_RADIUS,
  Box,
  Caption,
  Chip,
  FlexColumn,
  FlexRow,
  GAP,
  ResponsiveImage,
  SPACING_PX,
  Text,
  TextArea
} from "../../ui_primitives";
import { useSketchStore } from "../../sketch/state/useSketchStore";
import { useEntities } from "../../../serverState/useEntities";
import { ExampleBriefs } from "../ExampleBriefs";
import { GalleryFrame } from "../MediaGallery";
import { AlternativesColumn } from "../AlternativesColumn";
import ReportBugButton from "../../support/ReportBugButton";
import type { AlternativeEntry } from "../AlternativesColumn";
import type { UploadFirstLayerResult } from "../../../hooks/sketch/useUploadFirstLayer";
import { readEntityIds, readReferences } from "./setupContext";

/**
 * Three briefs that read like something a person would type. The storyboard
 * flow pulls its chips off the shipped example boards; there is no shipped
 * example-image library to read, so these are written here rather than faked
 * from one.
 */
const INSPIRATIONS: readonly string[] = [
  "A ceramic pour-over coffee dripper on a sunlit kitchen counter",
  "A portrait of a violinist backstage, one bare bulb overhead",
  "Poster art for a documentary about deep-sea cables"
];

export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

/** Reference thumbnail edge — 96px, big enough to recognise a picture. */
const REFERENCE_THUMBNAIL = SPACING_PX.xxxl * 3;

export interface IdeaStepProps {
  /** Opens the editor on a blank canvas — the flow's escape hatch. */
  onStartBlank: () => void;
  upload: UploadFirstLayerResult;
}

const IdeaStepInternal: React.FC<IdeaStepProps> = ({
  onStartBlank,
  upload
}) => {
  const { t } = useTranslation();
  const brief = useSketchStore((state) => state.document.setup?.brief ?? "");
  const setup = useSketchStore((state) => state.document.setup);
  const setSetup = useSketchStore((state) => state.setSetup);
  const fileInput = useRef<HTMLInputElement>(null);
  const briefField = useRef<HTMLElement | null>(null);
  const { data: entities } = useEntities();

  // What the composer was holding when the Image card was clicked (F4). It is
  // shown, not just stored: a reference the creator cannot see is a reference
  // they will attach twice.
  const references = useMemo(() => readReferences(setup), [setup]);
  const entityNames = useMemo(() => {
    const ids = new Set(readEntityIds(setup));
    return (entities ?? [])
      .filter((entity) => ids.has(entity.id))
      .map((entity) => entity.name);
  }, [entities, setup]);

  const handleChange = useCallback(
    (value: string) => {
      setSetup({ brief: value });
    },
    [setSetup]
  );

  // The picked file is read once; clearing the value lets the same file be
  // picked again after a refusal.
  const handlePicked = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) {
        void upload.uploadFirstLayer(file);
      }
    },
    [upload]
  );

  const alternatives: AlternativeEntry[] = useMemo(
    () => [
      {
        id: "upload",
        title: t("pass3_7.imageSetup.idea.uploadTitle"),
        description: t("pass3_7.imageSetup.idea.uploadDescription"),
        onSelect: () => fileInput.current?.click(),
        disabled: upload.uploading,
        disabledReason: upload.uploading
          ? t("pass3_7.imageSetup.idea.readingFile")
          : undefined
      },
      {
        id: "blank",
        title: t("pass3_7.imageSetup.idea.blankTitle"),
        description: t("pass3_7.imageSetup.idea.blankDescription"),
        onSelect: onStartBlank
      }
    ],
    [onStartBlank, t, upload.uploading]
  );

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          md: "minmax(0, 2fr) minmax(240px, 1fr)"
        },
        gap: GAP.spacious,
        alignItems: "start"
      }}
    >
      <FlexColumn gap={GAP.comfortable}>
        <FlexColumn gap={GAP.tight}>
          <Text size="big" component="h2">
            {t("pass3_7.imageSetup.idea.heading")}
          </Text>
          <Text size="normal" color="secondary">
            {t("pass3_7.imageSetup.idea.intro")}
          </Text>
        </FlexColumn>

        <TextArea
          value={brief}
          autoFocus
          rows={4}
          label={t("pass3_7.imageSetup.idea.imageLabel")}
          hideLabel
          placeholder={t("pass3_7.imageSetup.idea.placeholder")}
          onChange={handleChange}
          inputRef={briefField}
        />

        {upload.error ? (
          <AlertBanner
            severity="error"
            onClose={upload.clearError}
            action={
              <ReportBugButton
                context={{
                  source: "operation-failure",
                  summary: t("pass3_7.imageSetup.idea.uploadFailed"),
                  errorText: upload.error
                }}
              />
            }
          >
            {upload.error}
          </AlertBanner>
        ) : null}

        {references.length > 0 || entityNames.length > 0 ? (
          <FlexColumn gap={GAP.normal}>
            <Text size="small" component="h3">
              {t("pass3_7.imageSetup.idea.promptContext")}
            </Text>
            {references.length > 0 ? (
              <FlexRow
                role="group"
                aria-label={t("pass3_7.imageSetup.idea.referenceImages")}
                gap={GAP.normal}
                wrap
              >
                {references.map((reference) => (
                  <FlexColumn
                    key={reference.uri}
                    gap={GAP.tight}
                    sx={{ width: REFERENCE_THUMBNAIL }}
                  >
                    <GalleryFrame
                      locator={reference.uri}
                      kind="image"
                      caption={reference.name}
                      sx={{ width: "100%" }}
                    >
                      <ResponsiveImage
                        locator={reference.uri}
                        preferThumbnail
                        alt={reference.name}
                        aspectRatio="1/1"
                        fit="cover"
                        borderRadius={BORDER_RADIUS.sm}
                      />
                    </GalleryFrame>
                    <Caption color="secondary">{reference.name}</Caption>
                  </FlexColumn>
                ))}
              </FlexRow>
            ) : null}
            {entityNames.length > 0 ? (
              <FlexRow
                role="group"
                aria-label={t("pass3_7.imageSetup.idea.entities")}
                gap={GAP.normal}
                wrap
              >
                {entityNames.map((name) => (
                  <Chip key={name} label={name} />
                ))}
              </FlexRow>
            ) : null}
            <Caption color="secondary">
              {references.length > 0
                ? t("pass3_7.imageSetup.idea.referencesHelp")
                : t("pass3_7.imageSetup.idea.entitiesHelp")}
            </Caption>
          </FlexColumn>
        ) : null}

        <ExampleBriefs
          examples={INSPIRATIONS}
          brief={brief}
          onSelect={(value) => setSetup({ brief: value })}
          briefRef={briefField}
        />
      </FlexColumn>

      <AlternativesColumn
        label={t("pass3_7.imageSetup.idea.alternativesLabel")}
        alternatives={alternatives}
      />

      {/* The card is the control; this input only opens the picker. */}
      <input
        type="file"
        hidden
        ref={fileInput}
        accept={IMAGE_ACCEPT}
        aria-label={t("pass3_7.imageSetup.idea.uploadTitle")}
        onChange={handlePicked}
      />
    </Box>
  );
};

export const IdeaStep = memo(IdeaStepInternal);
IdeaStep.displayName = "ImageIdeaStep";

export default IdeaStep;
