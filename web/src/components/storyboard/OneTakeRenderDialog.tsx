/**
 * OneTakeRenderDialog
 *
 * Confirms a one-take render. The settings are picked in the one-take panel;
 * the dialog shows their effective values, the image count against its limit,
 * the cost and anything that blocks the render. Confirm renders with exactly
 * those settings.
 */

import React, { useCallback, useMemo } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import {
  AlertBanner,
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

const seconds = (value: number, locale: string, t: TFunction): string =>
  t("screens4_13.storyboard.oneTake.seconds", {
    count: value,
    value: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
      value
    )
  });

const formatLocalizedUsd = (usd: number, locale: string): string => {
  if (!Number.isFinite(usd) || usd <= 0) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0
    }).format(0);
  }
  const maximumFractionDigits =
    usd >= 0.01 ? 3 : Math.min(12, Math.ceil(-Math.log10(usd)) + 2);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits
  }).format(usd);
};

const OneTakeRenderDialog: React.FC<OneTakeRenderDialogProps> = ({
  boardId,
  open,
  onClose
}) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
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
  const localizeSecondsText = (value: string): string => {
    const parsed = /^(\d+(?:\.\d+)?)s$/.exec(value);
    return parsed ? seconds(Number(parsed[1]), locale, t) : value;
  };
  const localizedBlocker = (blocker: string): string => {
    if (blocker === "Add a shot to the board first.") {
      return t("screens4_13.storyboard.oneTake.blockers.addShot");
    }
    if (blocker === "Render a still for at least one shot.") {
      return t("screens4_13.storyboard.oneTake.blockers.renderStill");
    }
    if (blocker === "No video model chosen.") {
      return t("screens4_13.storyboard.oneTake.blockers.noModel");
    }
    const imageLimit =
      /^(\d+) images is over the limit of (\d+)\. Remove (\d+)\.$/.exec(
        blocker
      );
    if (imageLimit) {
      return t("screens4_13.storyboard.oneTake.blockers.imageLimit", {
        count: Number(imageLimit[1]),
        limit: Number(imageLimit[2]),
        removeCount: Number(imageLimit[3])
      });
    }
    const durationOption =
      /^(.*?) does not offer a (.+?) clip\. Pick one of (.+)\.$/.exec(blocker);
    if (durationOption) {
      return t("screens4_13.storyboard.oneTake.blockers.durationUnavailable", {
        model: durationOption[1],
        duration: localizeSecondsText(durationOption[2]),
        options: durationOption[3]
          .split(", ")
          .map(localizeSecondsText)
          .join(", ")
      });
    }
    const durationLimit =
      /^The take runs (.+?)\. One take renders at most (.+?)\.$/.exec(blocker);
    if (durationLimit) {
      return t("screens4_13.storyboard.oneTake.blockers.durationLimit", {
        duration: localizeSecondsText(durationLimit[1]),
        limit: localizeSecondsText(durationLimit[2])
      });
    }
    return blocker;
  };
  const rows: Array<[string, string]> = [
    [
      t("screens4_13.storyboard.oneTake.model"),
      model
        ? (model.name ?? model.id)
        : t("screens4_13.storyboard.oneTake.none")
    ],
    [
      t("screens4_13.storyboard.oneTake.duration"),
      seconds(duration_seconds, locale, t)
    ],
    [t("screens4_13.storyboard.oneTake.aspectRatio"), aspect_ratio],
    [t("screens4_13.storyboard.oneTake.resolution"), resolution],
    [
      t("screens4_13.storyboard.oneTake.images"),
      t("screens4_13.storyboard.oneTake.imageCount", {
        count: imageCount,
        limit: ONE_TAKE_MAX_IMAGES
      })
    ]
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("screens4_13.storyboard.oneTake.renderTitle")}
      onConfirm={handleConfirm}
      confirmText={t("screens4_13.storyboard.oneTake.renderConfirm", {
        estimate: priced ? ` · ~${formatLocalizedUsd(cost, locale)}` : ""
      })}
      confirmDisabled={blockers.length > 0}
    >
      <FlexColumn gap={SPACING.md}>
        <Caption color="secondary">
          {t("screens4_13.storyboard.oneTake.renderDescription")}
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
              ? t("screens4_13.storyboard.oneTake.estimatedCost", {
                  cost: formatLocalizedUsd(cost, locale)
                })
              : t("screens4_13.storyboard.oneTake.estimateUnavailable")}
          </Text>
        </FlexColumn>
        {blockers.length > 0 && (
          <AlertBanner severity="error">
            {blockers.map((blocker) => (
              <div key={blocker}>{localizedBlocker(blocker)}</div>
            ))}
          </AlertBanner>
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default OneTakeRenderDialog;
