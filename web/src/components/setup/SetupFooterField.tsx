/**
 * One compact input in the setup footer: a short caption and its control on
 * one line, sized so several fit beside the estimate and the primary button.
 */

import React from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Box, Caption, FlexRow, GAP } from "../ui_primitives";

/** A model name reads at this width without pushing the button off the row. */
export const SETUP_FOOTER_CONTROL_WIDTH = 200;

export interface SetupFooterFieldProps {
  /** One or two words: "Model", "Stills", "Music". */
  label: string;
  children: ReactNode;
  width?: number;
}

export function SetupFooterField({
  label,
  children,
  width = SETUP_FOOTER_CONTROL_WIDTH
}: SetupFooterFieldProps): React.ReactElement {
  const { t } = useTranslation();
  const translatedLabel =
    label === "Model"
      ? t("pass3_4.setupFooterField.labels.model")
      : label === "Art"
        ? t("pass3_4.setupFooterField.labels.art")
        : label === "Image model"
          ? t("pass3_4.setupFooterField.labels.imageModel")
          : label === "Stills"
            ? t("pass3_4.setupFooterField.labels.stills")
            : label === "Brief model"
              ? t("pass3_4.setupFooterField.labels.briefModel")
              : label === "Music"
                ? t("pass3_4.setupFooterField.labels.music")
                : label;
  return (
    <FlexRow gap={GAP.tight} align="center">
      <Caption
        size="small"
        color="secondary"
        component="span"
        sx={{ whiteSpace: "nowrap" }}
      >
        {translatedLabel}
      </Caption>
      <Box sx={{ width, minWidth: 0 }}>{children}</Box>
    </FlexRow>
  );
}

export default SetupFooterField;
