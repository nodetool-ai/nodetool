/**
 * OneTakeRenderDialog
 *
 * Confirms a one-take render. The settings are picked in the one-take panel;
 * the dialog shows their effective values, the image count against its limit,
 * the cost and anything that blocks the render. Confirm renders with exactly
 * those settings.
 */

import React, { useCallback, useMemo } from "react";
import { formatUsd } from "@nodetool-ai/model-pricing";

import {
  Caption,
  Dialog,
  FlexColumn,
  FlexRow,
  SPACING,
  Text
} from "../ui_primitives";
import {
  ONE_TAKE_MAX_IMAGES,
  useRenderOneTake
} from "../../hooks/storyboard/useRenderOneTake";
import { priceRenderStep } from "../../hooks/storyboard/shotCostPricing";

interface OneTakeRenderDialogProps {
  boardId: string;
  open: boolean;
  onClose: () => void;
}

const seconds = (value: number): string => `${Math.round(value * 10) / 10}s`;

const OneTakeRenderDialog: React.FC<OneTakeRenderDialogProps> = ({
  boardId,
  open,
  onClose
}) => {
  const { plan, settings, blockers, renderOneTake } = useRenderOneTake(boardId);
  const { model, duration_seconds, aspect_ratio, resolution } = settings;

  const imageCount = plan?.compiled.references.length ?? 0;

  const cost = useMemo(() => {
    if (!model || duration_seconds <= 0) {
      return null;
    }
    return priceRenderStep(
      "Clip",
      model,
      "clip model",
      resolution,
      duration_seconds,
      []
    ).cost;
  }, [model, resolution, duration_seconds]);

  const handleConfirm = useCallback(() => {
    if (blockers.length > 0) {
      return;
    }
    // A start that fails records its reason on the first shot.
    void renderOneTake().catch(() => undefined);
    onClose();
  }, [blockers.length, renderOneTake, onClose]);

  const priced = cost !== null && cost > 0;
  const rows: Array<[string, string]> = [
    ["Model", model ? (model.name ?? model.id) : "None"],
    ["Duration", seconds(duration_seconds)],
    ["Aspect ratio", aspect_ratio],
    ["Resolution", resolution],
    ["Images", `${imageCount} of ${ONE_TAKE_MAX_IMAGES}`]
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Render one take"
      onConfirm={handleConfirm}
      confirmText={`Render one take${priced ? ` · ~${formatUsd(cost)}` : ""}`}
      confirmDisabled={blockers.length > 0}
    >
      <FlexColumn gap={SPACING.md}>
        <Caption color="secondary">
          Renders the whole board as one continuous clip. The clip lands on the
          first shot, and every other shot plays its window of it. Change the
          settings in the one-take panel.
        </Caption>
        <FlexColumn gap={SPACING.micro} data-testid="one-take-settings">
          {rows.map(([label, value]) => (
            <FlexRow key={label} gap={SPACING.sm} justify="space-between">
              <Text size="small" color="secondary">
                {label}
              </Text>
              <Text size="small" data-testid={`one-take-setting-${label}`}>
                {value}
              </Text>
            </FlexRow>
          ))}
          <Text size="small">
            {priced
              ? `Estimated cost: about ${formatUsd(cost)}`
              : "Select a priced model to see the estimate."}
          </Text>
        </FlexColumn>
        {blockers.length > 0 && (
          <FlexColumn gap={SPACING.micro} role="alert">
            {blockers.map((blocker) => (
              <Caption key={blocker} sx={{ color: "error.main" }}>
                {blocker}
              </Caption>
            ))}
          </FlexColumn>
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default OneTakeRenderDialog;
