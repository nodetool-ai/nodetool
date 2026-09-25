/**
 * RenderCostSummary
 *
 * The estimate line under a render dialog's model picker: what the render is
 * about to spend, and why part of it could not be priced.
 */

import React from "react";
import { formatUsd } from "@nodetool-ai/model-pricing";

import { Caption, FlexColumn, Text, SPACING } from "../ui_primitives";
import type { RenderBatchCostEstimate } from "../../hooks/storyboard/useRenderBatchCostEstimate";

export const RenderCostSummary: React.FC<{
  estimate: RenderBatchCostEstimate;
}> = ({ estimate }) => {
  const { requestCount, cost, pricedRequestCount, reasons, notes } = estimate;
  const priced = pricedRequestCount > 0 && cost > 0;
  return (
    <FlexColumn gap={SPACING.micro}>
      <Text size="small">
        {priced
          ? `Estimated cost: about ${formatUsd(cost)}${
              pricedRequestCount < requestCount
                ? ` (${pricedRequestCount} of ${requestCount} requests priced)`
                : ""
            }`
          : "Select a priced model to see the estimate."}
      </Text>
      {reasons.map((reason) => (
        <Caption key={reason} color="secondary">
          {reason}
        </Caption>
      ))}
      {priced &&
        notes.map((note) => (
          <Caption key={note} color="secondary">
            {note}
          </Caption>
        ))}
    </FlexColumn>
  );
};

export default RenderCostSummary;
