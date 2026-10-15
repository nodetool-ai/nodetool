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

const formatOptions = (mp4Supported: boolean): readonly SelectOption[] => [
  { value: "mp4", label: "MP4 (H.264)", disabled: !mp4Supported },
  { value: "webm", label: "WebM (VP9)" },
  { value: "png_sequence", label: "PNG sequence (.zip)" }
];

const MP4_UNSUPPORTED_NOTE = "This browser cannot write MP4, so it is turned off.";

/** One line under the picker saying what the choice actually produces. */
const FORMAT_NOTE: Record<BrowserExportFormat, string> = {
  mp4: "Plays everywhere. No transparency.",
  webm: "VP9 video with Opus audio.",
  png_sequence:
    "One PNG per frame in a zip, with a manifest.json naming the rate and size. No audio."
};

/** What the dialog hands back when the user starts the render. */
export interface ExportVideoChoice {
  format: BrowserExportFormat;
  /** Keep the alpha channel. Never true for `mp4`, which cannot carry one. */
  alpha: boolean;
}

const ALPHA_LABEL = "Export with transparency";

/** Why the switch is off, or what turning it on does. */
const ALPHA_NOTE: Record<BrowserExportFormat, string> = {
  mp4: "MP4 carries no alpha channel. Choose WebM or a PNG sequence.",
  webm: "Composites over a transparent ground and keeps the alpha channel.",
  png_sequence: "Every PNG keeps its alpha channel."
};

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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export timeline"
      onConfirm={handleExport}
      confirmText="Export"
    >
      <FlexColumn gap={SPACING.lg}>
        <SelectField
          label="Format"
          value={format}
          onChange={handleFormatChange}
          options={formatOptions(mp4Supported)}
          description={
            mp4Supported
              ? FORMAT_NOTE[format]
              : `${FORMAT_NOTE[format]} ${MP4_UNSUPPORTED_NOTE}`
          }
        />
        <LabeledSwitch
          id="timeline-export-alpha"
          size="small"
          label={ALPHA_LABEL}
          checked={alpha}
          onChange={setAlpha}
          disabled={format === "mp4"}
          description={ALPHA_NOTE[format]}
        />
      </FlexColumn>
    </Dialog>
  );
};

export default ExportVideoDialog;
