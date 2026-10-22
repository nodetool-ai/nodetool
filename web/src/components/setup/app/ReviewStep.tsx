/**
 * Step 2 of the App flow — the design.
 *
 * The spec the build will be measured against, as editable text: the app's
 * title, what each workflow behind it does, and the label of everything on
 * the screen. The test run the build closes with is listed underneath, in
 * words, so the creator knows what "green" will mean. Nothing has been built
 * yet, and every edit writes straight back to the draft the build reads.
 */

import React, { memo, useMemo } from "react";

import {
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  Text
} from "../../ui_primitives";
import { PlanReview } from "../PlanReview";
import type { PlanReviewGroup, PlanReviewSection } from "../PlanReview";
import { REVIEW_CONTENT_WIDTH } from "../reviewStyles";
import ErrorBanner from "../../support/ErrorBanner";
import type { AppSpec } from "../../../utils/applicationBuild";
import {
  describeInteraction,
  humanizeSlug,
  isLayoutWidget,
  renameWidget,
  widgetTypeLabel
} from "./appSetupModel";

export interface AppReviewStepProps {
  spec: AppSpec;
  onSpecChange: (spec: AppSpec) => void;
  onRedesign: () => void;
  redesignPending: boolean;
  onCancelRedesign: () => void;
  error: string | null;
  readOnly?: boolean;
}

const fieldList = (fields: readonly { name: string }[]): string =>
  fields.map((field) => humanizeSlug(field.name).toLowerCase()).join(", ");

const ReviewStepInternal: React.FC<AppReviewStepProps> = ({
  spec,
  onSpecChange,
  onRedesign,
  redesignPending,
  onCancelRedesign,
  error,
  readOnly = false
}) => {
  const locked = readOnly || redesignPending;

  const sections = useMemo<PlanReviewSection[]>(() => {
    const operations: PlanReviewGroup[] = spec.operations.map(
      (operation, index) => {
        const takes = fieldList(operation.inputs);
        const gives = fieldList(operation.outputs);
        return {
          id: `operation-${operation.id}`,
          header: humanizeSlug(operation.id),
          meta: operation.streaming ? "Streams its result" : undefined,
          rows: [
            {
              id: `operation-${operation.id}-objective`,
              label: "What it does",
              value: operation.objective,
              multiline: true,
              // A bound workflow already exists; there is nothing to plan.
              readOnly: locked || Boolean(operation.workflowId),
              hint: [
                takes ? `Takes ${takes}.` : null,
                gives ? `Gives back ${gives}.` : null,
                operation.workflowId ? "Runs a workflow you already have." : null
              ]
                .filter(Boolean)
                .join(" "),
              onChange: (value: string) =>
                onSpecChange({
                  ...spec,
                  operations: spec.operations.map((entry, position) =>
                    position === index ? { ...entry, objective: value } : entry
                  )
                })
            }
          ]
        };
      }
    );

    const screen = spec.widgets
      .filter((widget) => !isLayoutWidget(widget.type))
      .map((widget) => ({
        id: `widget-${widget.role}`,
        label: widgetTypeLabel(widget.type),
        value: widget.label,
        compact: true,
        readOnly: locked,
        onChange: (value: string) =>
          onSpecChange(renameWidget(spec, widget.role, value))
      }));

    return [
      {
        id: "app",
        header: "The app",
        rows: [
          {
            id: "title",
            label: "Title",
            value: spec.title,
            readOnly: locked,
            onChange: (value: string) => onSpecChange({ ...spec, title: value })
          }
        ]
      },
      {
        id: "operations",
        header: "What it runs",
        subheader:
          "Each one becomes a workflow behind the screen. Say what it should do in plain words.",
        rows: [],
        groups: operations
      },
      {
        id: "screen",
        header: "On the screen",
        subheader: "The label each part shows, in the order it is placed.",
        rows: screen
      }
    ];
  }, [locked, onSpecChange, spec]);

  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexRow gap={GAP.normal} align="flex-start" justify="space-between" wrap>
        <FlexColumn gap={GAP.tight}>
          <Text size="big" component="h2">
            Review the design
          </Text>
          <Text size="normal" color="secondary">
            Edit anything before it is built. Nothing has been built yet.
          </Text>
        </FlexColumn>
        <FlexRow gap={GAP.normal} align="center">
          <EditorButton
            variant="outlined"
            size="small"
            onClick={onRedesign}
            disabled={locked}
            loading={redesignPending}
          >
            {redesignPending ? "Re-designing" : "Re-design"}
          </EditorButton>
          {redesignPending && !readOnly ? (
            <EditorButton variant="text" size="small" onClick={onCancelRedesign}>
              Cancel
            </EditorButton>
          ) : null}
        </FlexRow>
      </FlexRow>

      {error ? (
        <ErrorBanner
          report={{
            source: "operation-failure",
            summary: "Designing an app failed",
            errorText: error
          }}
        >
          {error}
        </ErrorBanner>
      ) : null}

      <PlanReview sections={sections} />

      {spec.interactions.length > 0 ? (
        <FlexColumn
          gap={GAP.tight}
          component="section"
          aria-label="How it is tested"
          sx={{ maxWidth: REVIEW_CONTENT_WIDTH }}
        >
          <Text size="normal" component="h3">
            How it is tested
          </Text>
          <Caption color="secondary" component="p">
            The build runs these before it installs anything. An app that fails
            one is not installed.
          </Caption>
          <FlexColumn component="ul" gap={GAP.tight} sx={{ margin: 0 }}>
            {spec.interactions.map((interaction) => (
              <Text key={interaction.name} size="normal" component="li">
                {describeInteraction(spec, interaction)}
              </Text>
            ))}
          </FlexColumn>
        </FlexColumn>
      ) : null}
    </FlexColumn>
  );
};

export const AppReviewStep = memo(ReviewStepInternal);
AppReviewStep.displayName = "AppReviewStep";

export default AppReviewStep;
