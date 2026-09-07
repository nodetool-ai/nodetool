/**
 * What a shotlist import kept and what it refused (PRD § 7.7.8).
 *
 * Shown once, and only when the file discarded something: the rows are already
 * on the board, so a clean import has nothing to confirm and does not stop the
 * creator on a dialog at all (F29). What is left is the values that did not
 * come with the file and where they were, so the creator can fix the row
 * rather than hunt for what changed. Step 3 keeps the same list inline.
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
        {shotCount} shot{shotCount === 1 ? "" : "s"} imported. These values did
        not come with them.
      </Text>
      <FlexColumn
        gap={GAP.tight}
        component="ul"
        sx={{ listStyle: "none", margin: 0, padding: 0, "& li": { listStyle: "none" } }}
      >
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
      {/* One way out: the import already wrote the board, so there is nothing
          here to confirm or cancel. */}
      <FlexRow justify="flex-end">
        <EditorButton onClick={onClose}>Continue</EditorButton>
      </FlexRow>
    </FlexColumn>
  </Dialog>
);

export default ShotlistReport;
