/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useMemo, memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Typography } from "@mui/material";
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
      gap: "12px"
    },
    ".preview-section": {
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    },
    ".preview-box": {
      padding: "16px",
      borderRadius: "8px",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      display: "flex",
      flexDirection: "column",
      gap: "4px"
    },
    ".preview-label": {
      fontSize: "10px",
      textTransform: "uppercase",
      opacity: 0.8
    },
    ".preview-text": {
      fontSize: "14px",
      fontWeight: 500
    },
    ".preview-text-large": {
      fontSize: "18px",
      fontWeight: 700
    },
    ".contrast-ratio": {
      fontSize: "24px",
      fontWeight: 700,
      textAlign: "center",
      margin: "8px 0"
    },
    ".compliance-grid": {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "8px"
    },
    ".compliance-item": {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 8px",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.grey[900]
    },
    ".compliance-label": {
      fontSize: "11px",
      flex: 1
    },
    ".color-blindness-section": {
      marginTop: "8px"
    },
    ".color-blindness-title": {
      fontSize: "11px",
      fontWeight: 600,
      color: theme.vars.palette.grey[400],
      marginBottom: "8px",
      textTransform: "uppercase"
    },
    ".color-blindness-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: "8px"
    },
    ".color-blindness-preview": {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      padding: "8px",
      borderRadius: "4px",
      backgroundColor: theme.vars.palette.grey[900]
    },
    ".cb-label": {
      fontSize: "9px",
      color: theme.vars.palette.grey[500],
      textAlign: "center"
    },
    ".cb-colors": {
      display: "flex",
      gap: "4px",
      justifyContent: "center"
    },
    ".cb-swatch": {
      width: "24px",
      height: "24px",
      borderRadius: "4px",
      border: `1px solid ${theme.vars.palette.grey[700]}`
    }
  });

interface ContrastCheckerProps {
  foregroundColor: string; // hex
  backgroundColor: string; // hex
}

const ContrastChecker: React.FC<ContrastCheckerProps> = ({
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

  // Color blindness simulations
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
      {/* Preview Section */}
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

      {/* Contrast Ratio */}
      <div>
        <Typography
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
        </Typography>
        <Typography
          variant="caption"
          sx={{ textAlign: "center", display: "block", color: "grey.500" }}
        >
          Contrast Ratio
        </Typography>
      </div>

      {/* WCAG Compliance Grid */}
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

      {/* Color Blindness Simulation */}
      <div className="color-blindness-section">
        <Typography className="color-blindness-title">
          Color Blindness Preview
        </Typography>
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
};

export default memo(ContrastChecker);
