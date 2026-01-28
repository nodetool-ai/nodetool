/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Typography, Tooltip } from "@mui/material";
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
      gap: "12px"
    },
    ".harmony-section": {
      display: "flex",
      flexDirection: "column",
      gap: "6px"
    },
    ".harmony-header": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    },
    ".harmony-title": {
      fontSize: "12px",
      fontWeight: 600,
      color: theme.vars.palette.grey[300]
    },
    ".harmony-description": {
      fontSize: "10px",
      color: theme.vars.palette.grey[500],
      marginTop: "2px"
    },
    ".harmony-colors": {
      display: "flex",
      gap: "4px"
    },
    ".harmony-color": {
      flex: 1,
      height: "32px",
      borderRadius: "4px",
      cursor: "pointer",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "transform 0.15s, box-shadow 0.15s",
      "&:hover": {
        transform: "scale(1.05)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        zIndex: 1
      }
    },
    ".color-hex": {
      fontSize: "9px",
      fontWeight: 600,
      textTransform: "uppercase",
      opacity: 0,
      transition: "opacity 0.15s"
    },
    ".harmony-color:hover .color-hex": {
      opacity: 1
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
  const theme = useTheme();
  const harmonyInfo = useMemo(() => getHarmonyInfo(), []);

  const harmonies = useMemo(() => {
    return harmonyInfo.map((info) => ({
      ...info,
      ...generateHarmony(color, info.type)
    }));
  }, [color, harmonyInfo]);

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
              <Typography className="harmony-title">{harmony.name}</Typography>
              <Typography className="harmony-description">
                {harmony.description}
              </Typography>
            </div>
            <CopyButton
              tooltip="Copy all colors"
              value={harmony.colors.join(", ")}
              buttonSize="small"
            />
          </div>
          <div className="harmony-colors">
            {harmony.colors.map((harmonyColor, index) => {
              const rgb = hexToRgb(harmonyColor);
              const textColor = getContrastingTextColor(rgb);
              const textHex = rgbToHex(textColor);

              return (
                <Tooltip key={index} title={`Click to use ${harmonyColor}`}>
                  <div
                    className="harmony-color"
                    style={{ backgroundColor: harmonyColor }}
                    onClick={handleSelectColorWithHarmony(harmonyColor, harmony.type)}
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

export default HarmonyPicker;
