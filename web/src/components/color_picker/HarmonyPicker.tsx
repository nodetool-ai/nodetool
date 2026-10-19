/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Text, Tooltip, Box, focusRing, MOTION, BORDER_RADIUS, SPACING, Z_INDEX, getSpacingPx, SHADOW } from "../ui_primitives";
import { CopyButton } from "../ui_primitives";
import {
  HarmonyType,
  generateHarmony,
  getHarmonyInfo
} from "../../utils/colorHarmonies";
import { getContrastingTextColor, hexToRgb, rgbToHex } from "../../utils/colorConversion";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.lg)
    },
    ".harmony-section": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.sm)
    },
    ".harmony-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    },
    ".harmony-title": {
      fontSize: "var(--fontSizeSmall)",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    ".harmony-description": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      marginTop: getSpacingPx(SPACING.micro)
    },
    ".harmony-colors": {
      display: "flex",
      gap: getSpacingPx(SPACING.xs)
    },
    ".harmony-color": {
      flex: 1,
      height: "32px",
      borderRadius: BORDER_RADIUS.sm,
      cursor: "pointer",
      border: `1px solid ${theme.vars.palette.divider}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: `${MOTION.transform}, box-shadow ${MOTION.fast}`,
      "&:hover": {
        transform: "scale(1.05)",
        boxShadow: SHADOW(theme).md,
        zIndex: Z_INDEX.raised
      }
    },
    ".color-hex": {
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      textTransform: "uppercase",
      opacity: 0,
      transition: `opacity ${MOTION.fast}`
    },
    ".harmony-color:focus-visible": focusRing(theme, 2),
    ".harmony-color:hover .color-hex, .harmony-color:focus-visible .color-hex": {
      opacity: 1
    },
    // A touch screen never hovers, so show the hex outright there.
    "@media (hover: none)": {
      ".color-hex": { opacity: 1 }
    }
  });

interface HarmonyPickerProps {
  color: string; // hex color
  onColorSelect: (color: string) => void;
  selectedHarmony?: HarmonyType;
  onHarmonyChange?: (type: HarmonyType) => void;
}

const HarmonyPicker: React.FC<HarmonyPickerProps> = ({
  color,
  onColorSelect,
  selectedHarmony,
  onHarmonyChange
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const harmonyInfo = useMemo(() => getHarmonyInfo(), []);

  const harmonies = useMemo(() => {
    return harmonyInfo.map((info) => ({
      ...info,
      ...generateHarmony(color, info.type),
      name: t(`i18n-next49-color-inputs.harmonyPicker.${info.type}.name`),
      description: t(`i18n-next49-color-inputs.harmonyPicker.${info.type}.description`)
    }));
  }, [color, harmonyInfo, t]);

  const handleColorSelectWithHarmony = useCallback(
    (harmonyColor: string, harmonyType: HarmonyType) => {
      onColorSelect(harmonyColor);
      if (onHarmonyChange) {
        onHarmonyChange(harmonyType);
      }
    },
    [onColorSelect, onHarmonyChange]
  );

  const handleSelectColorWithHarmony = useCallback(
    (harmonyColor: string, harmonyType: HarmonyType) => () => {
      handleColorSelectWithHarmony(harmonyColor, harmonyType);
    },
    [handleColorSelectWithHarmony]
  );

  return (
    <Box css={styles(theme)}>
      {harmonies.map((harmony) => (
        <div
          key={harmony.type}
          className="harmony-section"
          style={{
            opacity: selectedHarmony && selectedHarmony !== harmony.type ? 0.5 : 1
          }}
        >
          <div className="harmony-header">
            <div>
              <Text className="harmony-title">{harmony.name}</Text>
              <Text className="harmony-description">
                {harmony.description}
              </Text>
            </div>
            <CopyButton
              tooltip={t("i18n-next49-color-inputs.harmonyPicker.copyAllColors")}
              value={harmony.colors.join(", ")}
              buttonSize="small"
            />
          </div>
          <div className="harmony-colors">
            {harmony.colors.map((harmonyColor) => {
              const rgb = hexToRgb(harmonyColor);
              const textColor = getContrastingTextColor(rgb);
              const textHex = rgbToHex(textColor);

              return (
                <Tooltip
                  key={harmonyColor}
                  title={t("i18n-next49-color-inputs.harmonyPicker.clickToUse", { color: harmonyColor })}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={t("i18n-next49-color-inputs.harmonyPicker.useColor", { color: harmonyColor })}
                    className="harmony-color"
                    style={{ backgroundColor: harmonyColor }}
                    onClick={handleSelectColorWithHarmony(harmonyColor, harmony.type)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSelectColorWithHarmony(harmonyColor, harmony.type)(); } }}
                  >
                    <span className="color-hex" style={{ color: textHex }}>
                      {harmonyColor.replace("#", "")}
                    </span>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      ))}
    </Box>
  );
};

export default memo(HarmonyPicker);
