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

import {
  AlertBanner,
  Box,
  Caption,
  Chip,
  FlexColumn,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
import { useSketchStore } from "../../sketch/state/useSketchStore";
import { AlternativesColumn } from "../AlternativesColumn";
import type { AlternativeEntry } from "../AlternativesColumn";
import type { UploadFirstLayerResult } from "../../../hooks/sketch/useUploadFirstLayer";

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

export interface IdeaStepProps {
  /** Opens the editor on a blank canvas — the flow's escape hatch. */
  onStartBlank: () => void;
  upload: UploadFirstLayerResult;
}

const IdeaStepInternal: React.FC<IdeaStepProps> = ({
  onStartBlank,
  upload
}) => {
  const brief = useSketchStore((state) => state.document.setup?.brief ?? "");
  const setSetup = useSketchStore((state) => state.setSetup);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setSetup({ brief: event.target.value });
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
        title: "Upload an image to edit",
        description: "PNG, JPEG, WebP or GIF — it lands as your first layer",
        onSelect: () => fileInput.current?.click(),
        disabled: upload.uploading,
        disabledReason: upload.uploading ? "Reading your file…" : undefined
      },
      {
        id: "blank",
        title: "Start with a blank canvas",
        description: "Skip the brief and paint it yourself",
        onSelect: onStartBlank
      }
    ],
    [onStartBlank, upload.uploading]
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
            What image do you want?
          </Text>
          <Text size="normal" color="secondary">
            Describe it once. We&apos;ll refine the brief and render variations
            to pick from.
          </Text>
        </FlexColumn>

        <TextInput
          value={brief}
          autoFocus
          multiline
          rows={4}
          label="Your image"
          hideLabel
          placeholder="One sentence is enough."
          onChange={handleChange}
        />

        {upload.error ? (
          <AlertBanner severity="error" onClose={upload.clearError}>
            {upload.error}
          </AlertBanner>
        ) : null}

        <FlexColumn gap={GAP.normal}>
          <Caption color="secondary" component="p">
            Or start from one of these:
          </Caption>
          <Box
            role="group"
            aria-label="Inspiration"
            sx={{ display: "flex", flexWrap: "wrap", gap: GAP.normal }}
          >
            {INSPIRATIONS.map((line) => (
              <Chip
                key={line}
                label={line}
                onClick={() => setSetup({ brief: line })}
              />
            ))}
          </Box>
        </FlexColumn>
      </FlexColumn>

      <AlternativesColumn
        label="Other ways to start"
        alternatives={alternatives}
      />

      {/* The card is the control; this input only opens the picker. */}
      <input
        type="file"
        hidden
        ref={fileInput}
        accept={IMAGE_ACCEPT}
        aria-label="Upload an image to edit"
        onChange={handlePicked}
      />
    </Box>
  );
};

export const IdeaStep = memo(IdeaStepInternal);
IdeaStep.displayName = "ImageIdeaStep";

export default IdeaStep;
