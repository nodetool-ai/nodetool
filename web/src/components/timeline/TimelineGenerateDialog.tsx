/**
 * TimelineGenerateDialog — the timeline's Generate dialog. It generates a
 * video, speech or music clip at the playhead and closes once the clip is
 * placed; the clip itself shows the render's progress.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";

import { Dialog } from "../ui_primitives";
import { TimelineGeneratePanel } from "./TimelineGeneratePanel";

interface TimelineGenerateDialogProps {
  open: boolean;
  onClose: () => void;
}

const TimelineGenerateDialogInner: React.FC<TimelineGenerateDialogProps> = ({
  open,
  onClose
}) => {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("screen_timeline.generate.title")}
      maxWidth="md"
      fullWidth
    >
      <TimelineGeneratePanel onGenerated={onClose} />
    </Dialog>
  );
};

export const TimelineGenerateDialog = memo(TimelineGenerateDialogInner);
TimelineGenerateDialog.displayName = "TimelineGenerateDialog";

export default TimelineGenerateDialog;
