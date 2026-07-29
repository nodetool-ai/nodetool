/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo, memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Text, Caption, Box, BORDER_RADIUS, SPACING, getSpacingPx } from "../ui_primitives";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import {
  hexToRgb,
  getWcagCompliance,
  rgbToHex,
  simulateColorBlindness
} from "../../utils/colorConversion";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.lg)
    },
    ".preview-section": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.md)
    },
    ".preview-box": {
      padding: getSpacingPx(SPACING.xl),
      borderRadius: BORDER_RADIUS.lg,
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.xs)
    },
    ".preview-label": {
      fontSize: "var(--fontSizeSmaller)",
      textTransform: "uppercase",
      opacity: 0.8
    },
    ".preview-text": {
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 500
    },
    ".preview-text-large": {
      fontSize: "var(--fontSizeBig)",
      fontWeight: 600
    },
    ".contrast-ratio": {
      fontSize: "var(--fontSizeBig)",
      fontWeight: 600,
      textAlign: "center",
      margin: `${getSpacingPx(SPACING.md)} 0`
    },
    ".compliance-grid": {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: getSpacingPx(SPACING.md)
    },
    ".compliance-item": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.md)}`,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: theme.vars.palette.grey[900]
    },
    ".compliance-label": {
      fontSize: "var(--fontSizeSmaller)",
      flex: 1
    },
    ".color-blindness-section": {
      marginTop: getSpacingPx(SPACING.md)
    },
    ".color-blindness-title": {
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      color: theme.vars.palette.grey[400],
      marginBottom: getSpacingPx(SPACING.md),
      textTransform: "uppercase"
    },
    ".color-blindness-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: getSpacingPx(SPACING.md)
    },
    ".color-blindness-preview": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.xs),
      padding: getSpacingPx(SPACING.md),
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: theme.vars.palette.grey[900]
    },
    ".cb-label": {
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.grey[500],
      textAlign: "center"
    },
    ".cb-colors": {
      display: "flex",
      gap: getSpacingPx(SPACING.xs),
      justifyContent: "center"
    },
    ".cb-swatch": {
      width: "24px",
      height: "24px",
      borderRadius: BORDER_RADIUS.sm,
      border: `1px solid ${theme.vars.palette.grey[700]}`
    }
  });

interface ContrastCheckerProps {
  foregroundColor: string; // hex
  backgroundColor: string; // hex
}

const ContrastChecker: React.FC<ContrastCheckerProps> = React.memo(({
  foregroundColor,
  backgroundColor
}) => {
  const theme = useTheme();

  const foregroundRgb = useMemo(() => hexToRgb(foregroundColor), [foregroundColor]);
  const backgroundRgb = useMemo(() => hexToRgb(backgroundColor), [backgroundColor]);

  const compliance = useMemo(
    () => getWcagCompliance(foregroundRgb, backgroundRgb),
    [foregroundRgb, backgroundRgb]
  );

  const colorBlindnessTypes = useMemo(
    () => [
      {
        type: "protanopia" as const,
        label: "Protanopia",
        description: "Red-blind"
      },
      {
        type: "deuteranopia" as const,
        label: "Deuteranopia",
        description: "Green-blind"
      },
      {
        type: "tritanopia" as const,
        label: "Tritanopia",
        description: "Blue-blind"
      }
    ],
    []
  );

  const colorBlindnessSimulations = useMemo(() => {
    return colorBlindnessTypes.map((cb) => ({
      ...cb,
      foreground: rgbToHex(simulateColorBlindness(foregroundRgb, cb.type)),
      background: rgbToHex(simulateColorBlindness(backgroundRgb, cb.type))
    }));
  }, [foregroundRgb, backgroundRgb, colorBlindnessTypes]);

  const ComplianceIcon = ({ passed }: { passed: boolean }) =>
    passed ? (
      <CheckCircleIcon sx={{ fontSize: 16, color: "success.main" }} />
    ) : (
      <CancelIcon sx={{ fontSize: 16, color: "error.main" }} />
    );

  return (
    <Box css={styles(theme)}>
      <div className="preview-section">
        <div
          className="preview-box"
          style={{ backgroundColor: backgroundColor, color: foregroundColor }}
        >
          <span className="preview-label">Preview on Background</span>
          <span className="preview-text">Normal text sample</span>
          <span className="preview-text-large">Large text sample</span>
        </div>

        <div
          className="preview-box"
          style={{ backgroundColor: foregroundColor, color: backgroundColor }}
        >
          <span className="preview-label">Inverse Preview</span>
          <span className="preview-text">Normal text sample</span>
          <span className="preview-text-large">Large text sample</span>
        </div>
      </div>

      <div>
        <Text
          className="contrast-ratio"
          sx={{
            color:
              compliance.ratio >= 4.5
                ? "success.main"
                : compliance.ratio >= 3
                  ? "warning.main"
                  : "error.main"
          }}
        >
          {compliance.ratio}:1
        </Text>
        <Caption
          sx={{ textAlign: "center", display: "block", color: "grey.500" }}
        >
          Contrast Ratio
        </Caption>
      </div>

      <div className="compliance-grid">
        <div className="compliance-item">
          <ComplianceIcon passed={compliance.aa} />
          <span className="compliance-label">AA Normal (4.5:1)</span>
        </div>
        <div className="compliance-item">
          <ComplianceIcon passed={compliance.aaLarge} />
          <span className="compliance-label">AA Large (3:1)</span>
        </div>
        <div className="compliance-item">
          <ComplianceIcon passed={compliance.aaa} />
          <span className="compliance-label">AAA Normal (7:1)</span>
        </div>
        <div className="compliance-item">
          <ComplianceIcon passed={compliance.aaaLarge} />
          <span className="compliance-label">AAA Large (4.5:1)</span>
        </div>
      </div>

      <div className="color-blindness-section">
        <Text className="color-blindness-title">
          Color Blindness Preview
        </Text>
        <div className="color-blindness-grid">
          {colorBlindnessSimulations.map((sim) => (
            <div key={sim.type} className="color-blindness-preview">
              <span className="cb-label">{sim.label}</span>
              <div className="cb-colors">
                <div
                  className="cb-swatch"
                  style={{ backgroundColor: sim.foreground }}
                  title={`Foreground: ${sim.foreground}`}
                />
                <div
                  className="cb-swatch"
                  style={{ backgroundColor: sim.background }}
                  title={`Background: ${sim.background}`}
                />
              </div>
              <span className="cb-label">{sim.description}</span>
            </div>
          ))}
        </div>
      </div>
    </Box>
  );
});

ContrastChecker.displayName = 'ContrastChecker';

export default memo(ContrastChecker);
