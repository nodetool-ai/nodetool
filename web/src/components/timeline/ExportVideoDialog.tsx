/**
 * The format and transparency choice the browser export offers before it
 * starts (T27).
 *
 * Three containers, and the reason each is here: MP4 is what plays everywhere,
 * WebM is VP9 and is the one the browser encoder can write with a transparency
 * channel, and a PNG sequence is a zip of stills for a compositor that wants
 * the frames rather than a clip.
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
import type { BrowserExportFormat } from "./render/TimelineRenderer";
import { canEncodeMp4 } from "./render/canEncodeMp4";


/** What the dialog hands back when the user starts the render. */
export interface ExportVideoChoice {
  format: BrowserExportFormat;
  /** Keep the alpha channel. Never true for `mp4`, which cannot carry one. */
  alpha: boolean;
}

export interface ExportVideoDialogProps {
  open: boolean;
  onClose: () => void;
  /** Start the render with the chosen format and transparency. */
  onExport: (choice: ExportVideoChoice) => void;
}

function isExportFormat(value: string): value is BrowserExportFormat {
  return value === "mp4" || value === "webm" || value === "png_sequence";
}

export const ExportVideoDialog: React.FC<ExportVideoDialogProps> = ({
  open,
  onClose,
  onExport
}) => {
  const { t } = useTranslation();
  const width = useTimelineStore((state) => state.width);
  const height = useTimelineStore((state) => state.height);
  const [format, setFormat] = useState<BrowserExportFormat>("mp4");
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
    // MP4 refuses alpha in the renderer, so the switch cannot stay on behind a
    // disabled control and send a request that would only throw.
    if (value === "mp4") setAlpha(false);
  }, []);

  const handleExport = useCallback(() => {
    onExport({ format, alpha });
    onClose();
  }, [format, alpha, onExport, onClose]);

  const formatOptions: readonly SelectOption[] = [
    { value: "mp4", label: "MP4 (H.264)", disabled: !mp4Supported },
    { value: "webm", label: "WebM (VP9)" },
    { value: "png_sequence", label: t("timeline.export.pngSequence") }
  ];
  const formatNote = {
    mp4: t("timeline.export.mp4Note"),
    webm: t("timeline.export.webmNote"),
    png_sequence: t("timeline.export.pngSequenceNote")
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
          disabled={format === "mp4"}
          description={t(`timeline.export.alphaNote.${format}`)}
        />
      </FlexColumn>
    </Dialog>
  );
};

export default ExportVideoDialog;
