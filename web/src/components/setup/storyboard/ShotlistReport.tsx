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
import { useTranslation } from "react-i18next";

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
}) => {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("pass3_11.storyboard.shotlistReport.title")}
    >
      <FlexColumn gap={GAP.normal}>
        <Text size="normal">
          {t("pass3_11.storyboard.shotlistReport.summary", {
            count: shotCount
          })}
        </Text>
        <FlexColumn
          gap={GAP.tight}
          component="ul"
          sx={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            "& li": { listStyle: "none" }
          }}
        >
          {entries.map((entry) => (
            <Caption
              key={`${entry.row}:${entry.column}:${entry.value}`}
              component="li"
              color="secondary"
            >
              {t(
                entry.value === ""
                  ? "pass3_11.storyboard.look.shotlist.rowWithoutValue"
                  : "pass3_11.storyboard.look.shotlist.rowWithValue",
                {
                  row: entry.row,
                  column: entry.column,
                  value: entry.value,
                  reason:
                    entry.reason === "Row skipped: a shot needs a description."
                      ? t(
                          "pass3_11.storyboard.shotlistReport.reasons.missingDescription"
                        )
                      : entry.reason ===
                          "Not a positive number. The shot imported without a duration."
                        ? t(
                            "pass3_11.storyboard.shotlistReport.reasons.invalidDuration"
                          )
                        : entry.reason.startsWith("Not one of: ")
                          ? t(
                              "pass3_11.storyboard.shotlistReport.reasons.invalidChoice",
                              {
                                options: entry.reason
                                  .slice("Not one of: ".length)
                                  .replace(
                                    ". The shot imported without it.",
                                    ""
                                  )
                              }
                            )
                          : entry.reason
                }
              )}
            </Caption>
          ))}
        </FlexColumn>
        {/* One way out: the import already wrote the board, so there is nothing
          here to confirm or cancel. */}
        <FlexRow justify="flex-end">
          <EditorButton onClick={onClose}>
            {t("pass3_11.storyboard.shotlistReport.continue")}
          </EditorButton>
        </FlexRow>
      </FlexColumn>
    </Dialog>
  );
};

export default ShotlistReport;
