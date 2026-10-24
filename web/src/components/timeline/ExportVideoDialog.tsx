/**
 * The format and transparency choice the browser export offers before it
 * starts (T27).
 *
 * Five formats, and the reason each is here: MP4 is what plays everywhere,
 * WebM is VP9 and is the one the browser encoder can write with a transparency
 * channel, a PNG sequence is a zip of stills for a compositor that wants the
 * frames rather than a clip, and WAV and MP3 are the audio mixdown alone: WAV
 * uncompressed for a DAW or a mastering pass, MP3 for sharing.
 *
 * The dialog picks the format and hands it to the caller; the render itself is
 * `useTimelineExport`.
 */

import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Dialog,
  FlexColumn,
  LabeledSwitch,
  SelectField,
  SPACING,
  type SelectOption
} from "../ui_primitives";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import type { TimelineExportFormat } from "../../hooks/timeline/useTimelineExport";
import { canEncodeMp4 } from "./render/canEncodeMp4";


/** What the dialog hands back when the user starts the render. */
export interface ExportVideoChoice {
  format: TimelineExportFormat;
  /** Keep the alpha channel. Never true for `mp4` or an audio format, which cannot carry one. */
  alpha: boolean;
}

export interface ExportVideoDialogProps {
  open: boolean;
  onClose: () => void;
  /** Start the render with the chosen format and transparency. */
  onExport: (choice: ExportVideoChoice) => void;
}

function isExportFormat(value: string): value is TimelineExportFormat {
  return (
    value === "mp4" ||
    value === "webm" ||
    value === "png_sequence" ||
    value === "wav" ||
    value === "mp3"
  );
}

/** Formats with no alpha channel, where the transparency switch is off. */
function isOpaqueFormat(format: TimelineExportFormat): boolean {
  return format === "mp4" || format === "wav" || format === "mp3";
}

export const ExportVideoDialog: React.FC<ExportVideoDialogProps> = ({
  open,
  onClose,
  onExport
}) => {
  const { t } = useTranslation();
  const width = useTimelineStore((state) => state.width);
  const height = useTimelineStore((state) => state.height);
  const [format, setFormat] = useState<TimelineExportFormat>("mp4");
  const [alpha, setAlpha] = useState(false);
  const [mp4Supported, setMp4Supported] = useState(true);

  // Ask the encoder before the render does: a browser without H.264 would
  // otherwise fail the default export with the encoder's configuration string.
  useEffect(() => {
    if (!open) return;
    let current = true;
    void canEncodeMp4(width, height).then((supported) => {
      if (!current) return;
      setMp4Supported(supported);
      if (!supported) {
        setFormat((chosen) => (chosen === "mp4" ? "webm" : chosen));
      }
    });
    return () => {
      current = false;
    };
  }, [open, width, height]);

  const handleFormatChange = useCallback((value: string) => {
    if (!isExportFormat(value)) return;
    setFormat(value);
    // MP4 refuses alpha in the renderer and audio has no picture, so the switch
    // cannot stay on behind a disabled control.
    if (isOpaqueFormat(value)) setAlpha(false);
  }, []);

  const handleExport = useCallback(() => {
    onExport({ format, alpha });
    onClose();
  }, [format, alpha, onExport, onClose]);

  const formatOptions: readonly SelectOption[] = [
    { value: "mp4", label: "MP4 (H.264)", disabled: !mp4Supported },
    { value: "webm", label: "WebM (VP9)" },
    { value: "png_sequence", label: t("timeline.export.pngSequence") },
    { value: "wav", label: t("timeline.export.wav") },
    { value: "mp3", label: t("timeline.export.mp3") }
  ];
  const formatNote = {
    mp4: t("timeline.export.mp4Note"),
    webm: t("timeline.export.webmNote"),
    png_sequence: t("timeline.export.pngSequenceNote"),
    wav: t("timeline.export.wavNote"),
    mp3: t("timeline.export.mp3Note")
  }[format];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("timeline.export.title")}
      onConfirm={handleExport}
      confirmText={t("timeline.export.export")}
    >
      <FlexColumn gap={SPACING.lg}>
        <SelectField
          label={t("timeline.export.format")}
          value={format}
          onChange={handleFormatChange}
          options={formatOptions}
          description={
            mp4Supported
              ? formatNote
              : `${formatNote} ${t("timeline.export.mp4Unsupported")}`
          }
        />
        <LabeledSwitch
          id="timeline-export-alpha"
          size="small"
          label={t("timeline.export.alphaLabel")}
          checked={alpha}
          onChange={setAlpha}
          disabled={isOpaqueFormat(format)}
          description={t(`timeline.export.alphaNote.${format}`)}
        />
      </FlexColumn>
    </Dialog>
  );
};

export default ExportVideoDialog;
