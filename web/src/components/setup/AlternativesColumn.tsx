/**
 * The side column on step 1 of every flow (PRD § 6.3): the other ways in —
 * upload a file, import a shotlist, start blank, open the tutorial. Each is a
 * title, a line of copy, and an action. A path a later phase enables renders
 * disabled with a tooltip naming that phase.
 *
 * Every card here routes: it opens a picker, starts a document, or shows the
 * tutorial. None of them is a choice among the others, so they are navigation
 * cards, not toggles — a `SetupCardButton` left on its default would announce
 * a pressed state the moment anything passed `selected`. The column is a list
 * of routes rather than a group of related controls, which is also what keeps
 * its name on something a screen reader reads.
 */

import React, { memo } from "react";
import type { ReactNode } from "react";

import { Box, Caption, FlexColumn, FlexRow, GAP, Text } from "../ui_primitives";
import { SetupCardButton } from "./SetupCardButton";

export interface AlternativeEntry {
  id: string;
  title: string;
  /** One line of copy under the title. */
  description: string;
  onSelect: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  /** Names the phase that enables the path, e.g. "Available in P5". */
  disabledReason?: string;
}

export interface AlternativesColumnProps {
  /** Accessible name for the column, e.g. "Other ways to start". */
  label: string;
  /**
   * Shows {@link AlternativesColumnProps.label} above the cards. A column that
   * mixes kinds — two ways to bring your own file, then an escape hatch and a
   * help link — needs to say which cards belong together; one that holds a
   * single kind does not.
   */
  showLabel?: boolean;
  alternatives: readonly AlternativeEntry[];
}

const AlternativesColumnInternal: React.FC<AlternativesColumnProps> = ({
  label,
  showLabel = false,
  alternatives
}) => (
  <FlexColumn gap={GAP.comfortable}>
    {showLabel ? (
      <Caption component="p" color="muted">
        {label}
      </Caption>
    ) : null}
    <FlexColumn
      component="ul"
      aria-label={label}
      gap={GAP.comfortable}
      sx={{ listStyle: "none", margin: 0, padding: 0 }}
    >
      {alternatives.map((alternative) => (
        <Box component="li" key={alternative.id}>
          <SetupCardButton
            role="navigation"
            disabled={alternative.disabled}
            disabledReason={alternative.disabledReason}
            onSelect={alternative.onSelect}
          >
            <FlexRow gap={GAP.normal} align="flex-start">
              {alternative.icon}
              <FlexColumn gap={GAP.micro}>
                <Text size="normal" component="span">
                  {alternative.title}
                </Text>
                <Caption component="span" color="secondary">
                  {alternative.description}
                </Caption>
              </FlexColumn>
            </FlexRow>
          </SetupCardButton>
        </Box>
      ))}
    </FlexColumn>
  </FlexColumn>
);

export const AlternativesColumn = memo(AlternativesColumnInternal);
AlternativesColumn.displayName = "AlternativesColumn";

export default AlternativesColumn;
