/**
 * The side column on step 1 of every flow (PRD § 6.3): the other ways in —
 * upload a file, import a shotlist, start blank, open the tutorial. Each is a
 * title, a line of copy, and an action. A path a later phase enables renders
 * disabled with a tooltip naming that phase.
 */

import React, { memo } from "react";
import type { ReactNode } from "react";

import { Caption, FlexColumn, FlexRow, GAP, Text } from "../ui_primitives";
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
  alternatives: readonly AlternativeEntry[];
}

const AlternativesColumnInternal: React.FC<AlternativesColumnProps> = ({
  label,
  alternatives
}) => (
  <FlexColumn role="group" aria-label={label} gap={GAP.comfortable}>
    {alternatives.map((alternative) => (
      <SetupCardButton
        key={alternative.id}
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
    ))}
  </FlexColumn>
);

export const AlternativesColumn = memo(AlternativesColumnInternal);
AlternativesColumn.displayName = "AlternativesColumn";

export default AlternativesColumn;
