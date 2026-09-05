/**
 * The plan step, generic over the plan's shape (PRD § 6.3): the storyboard
 * screenplay, the video beat list, the script, the image brief, the workflow
 * step list. Sections with a header, rows that are inline-editable fields, and
 * one `Re-plan` action whose label the flow chooses — the storyboard flow
 * calls it `Re-direct`.
 *
 * Cheap text before spend (PRD § 6.2, D4): nothing here renders, generates or
 * places anything. Every edit writes straight back through the row's
 * `onChange`, because the document is the draft.
 */

import React, { memo } from "react";

import {
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  Text,
  TextInput
} from "../ui_primitives";

export interface PlanReviewField {
  id: string;
  /** Visible label and the field's accessible name. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Multi-line body text — an action line, a beat, a step description. */
  multiline?: boolean;
  placeholder?: string;
  /** A field the flow owns elsewhere, e.g. dialogue on a script-linked board. */
  readOnly?: boolean;
}

export interface PlanReviewSection {
  id: string;
  /** Section header — a slugline, a beat title, a step name. */
  header: string;
  /** One line under the header, e.g. a scene's lighting note. */
  subheader?: string;
  rows: readonly PlanReviewField[];
}

export interface PlanReviewProps {
  sections: readonly PlanReviewSection[];
  /** The re-plan action's label, e.g. "Re-direct". */
  replanLabel: string;
  onReplan: () => void;
  /** True while the plan generator is running. */
  replanPending?: boolean;
}

const PlanReviewInternal: React.FC<PlanReviewProps> = ({
  sections,
  replanLabel,
  onReplan,
  replanPending = false
}) => (
  <FlexColumn gap={GAP.spacious}>
    {sections.map((section) => (
      <FlexColumn key={section.id} gap={GAP.normal} component="section">
        <FlexColumn gap={GAP.micro}>
          <Text size="normal" component="h3">
            {section.header}
          </Text>
          {section.subheader ? (
            <Text size="small" color="secondary">
              {section.subheader}
            </Text>
          ) : null}
        </FlexColumn>
        {section.rows.map((row) => (
          <TextInput
            key={row.id}
            label={row.label}
            value={row.value}
            multiline={row.multiline}
            placeholder={row.placeholder}
            onChange={(event) => row.onChange(event.target.value)}
            slotProps={{ input: { readOnly: row.readOnly } }}
          />
        ))}
      </FlexColumn>
    ))}
    <FlexRow gap={GAP.normal} justify="flex-start">
      <EditorButton
        variant="outlined"
        onClick={onReplan}
        disabled={replanPending}
      >
        {replanLabel}
      </EditorButton>
    </FlexRow>
  </FlexColumn>
);

export const PlanReview = memo(PlanReviewInternal);
PlanReview.displayName = "PlanReview";

export default PlanReview;
