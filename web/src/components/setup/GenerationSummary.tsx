import React from "react";
import { formatUsd } from "@nodetool-ai/model-pricing";
import {
  Caption,
  FlexColumn,
  FlexRow,
  GAP,
  Label,
  Text
} from "../ui_primitives";
import { generationEstimate, type GenerationModel } from "./generationEstimate";

export interface GenerationSummaryProps {
  result: string;
  next: string;
  model: GenerationModel | null;
  brief: string;
  maxOutputTokens: number;
  /** Imported attributed text or a preset plan needs no model call. */
  noModelCall?: boolean;
}

export default function GenerationSummary({
  result,
  next,
  model,
  brief,
  maxOutputTokens,
  noModelCall
}: GenerationSummaryProps) {
  const estimate = noModelCall
    ? null
    : generationEstimate(model, brief, maxOutputTokens);
  const cost = noModelCall
    ? "$0, no model call"
    : estimate
      ? estimate.high === 0
        ? "$0 provider cost (local model)"
        : `Rough cost: ${formatUsd(estimate.low)}–${formatUsd(estimate.high)}`
      : "Cost estimate unavailable for this model";
  return (
    <FlexColumn gap={GAP.tight} role="region" aria-label="Before you generate">
      <Label>{result}</Label>
      <Text size="small" color="secondary">
        {next}
      </Text>
      <FlexRow gap={GAP.spacious} wrap>
        <Text size="small">
          {noModelCall
            ? "Uses the existing text or preset"
            : `Model: ${model?.name ?? model?.id ?? "Not selected"}${model ? ` (${model.provider})` : ""}`}
        </Text>
        <Text size="small">{cost}</Text>
        <Text size="small">
          {noModelCall
            ? "Ready immediately"
            : "Rough wait: 30–60 seconds; longer for large requests or slower models"}
        </Text>
      </FlexRow>
      {estimate && estimate.high > 0 ? (
        <Caption color="secondary">{`Assumes about ${estimate.inputTokens.toLocaleString()} input tokens and 1,000–${maxOutputTokens.toLocaleString()} output tokens. Actual usage, including reasoning, may cost more.`}</Caption>
      ) : null}
    </FlexColumn>
  );
}
