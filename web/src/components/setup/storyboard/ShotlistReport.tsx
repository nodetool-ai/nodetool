/**
 * What a shotlist import kept and what it refused (PRD § 7.7.8).
 *
 * Shown once, after the import has already written the board: the file is in,
 * and this says which values did not come with it and where they were, so the
 * creator can fix the row rather than hunt for what changed.
 */

import React from "react";

import {
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  Text
} from "../../ui_primitives";
import type { ShotlistReportEntry } from "../../../lib/storyboard/parseShotlistCsv";

export interface ShotlistReportProps {
  open: boolean;
  shotCount: number;
  entries: readonly ShotlistReportEntry[];
  onClose: () => void;
}

export const ShotlistReport: React.FC<ShotlistReportProps> = ({
  open,
  shotCount,
  entries,
  onClose
}) => (
  <Dialog open={open} onClose={onClose} title="Shotlist imported">
    <FlexColumn gap={GAP.normal}>
      <Text size="normal">
        {shotCount} shot{shotCount === 1 ? "" : "s"} imported.
      </Text>
      {entries.length === 0 ? (
        <Caption color="secondary" component="p">
          Every value in the file was accepted.
        </Caption>
      ) : (
        <FlexColumn gap={GAP.tight} component="ul">
          {entries.map((entry) => (
            <Caption
              key={`${entry.row}:${entry.column}:${entry.value}`}
              component="li"
              color="secondary"
            >
              Row {entry.row}, {entry.column}
              {entry.value === "" ? "" : ` — “${entry.value}”`}: {entry.reason}
            </Caption>
          ))}
        </FlexColumn>
      )}
      {/* One way out: the import already wrote the board, so there is nothing
          here to confirm or cancel. */}
      <FlexRow justify="flex-end">
        <EditorButton onClick={onClose}>Continue</EditorButton>
      </FlexRow>
    </FlexColumn>
  </Dialog>
);

export default ShotlistReport;
