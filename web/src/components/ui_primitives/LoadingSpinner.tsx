/** @jsxImportSource @emotion/react */
import React from "react";
import { css, keyframes } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, CircularProgress, Typography } from "@mui/material";

const pulse = keyframes`
  0%, 80%, 100% {
    transform: scale(0.6);
    opacity: 0.3;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
`;

const styles = (theme: Theme, variant: string, size: string) =>
  css({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing(1),
    
    ".dots-container": {
      display: "flex",
      gap: size === "small" ? 4 : size === "large" ? 8 : 6
    },
    ".dot": {
      width: size === "small" ? 6 : size === "large" ? 12 : 8,
      height: size === "small" ? 6 : size === "large" ? 12 : 8,
      borderRadius: "50%",
      backgroundColor: theme.vars.palette.primary.main,
      animation: `${pulse} 1.4s infinite ease-in-out`,
      "&:nth-of-type(1)": { animationDelay: "-0.32s" },
      "&:nth-of-type(2)": { animationDelay: "-0.16s" },
      "&:nth-of-type(3)": { animationDelay: "0s" }
    },
    ".loading-text": {
      color: theme.vars.palette.text.secondary,
      fontSize: size === "small" ? 12 : size === "large" ? 16 : 14
    }
  });

export type LoadingVariant = "circular" | "dots";

export interface LoadingSpinnerProps {
  /** Loading variant */
  variant?: LoadingVariant;
  /** Size of the spinner */
  size?: "small" | "medium" | "large";
  /** Optional loading text */
  text?: string;
  /** Color override */
  color?: "primary" | "secondary" | "inherit";
  /** Custom class name */
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  variant = "circular",
  size = "medium",
  text,
  color = "primary",
  className
}) => {
  const theme = useTheme();

  const circularSize = size === "small" ? 20 : size === "large" ? 48 : 32;

  const renderContent = () => {
    switch (variant) {
      case "dots":
        return (
          <Box className="dots-container">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </Box>
        );
      case "circular":
      default:
        return <CircularProgress size={circularSize} color={color} />;
    }
  };

  return (
    <Box css={styles(theme, variant, size)} className={`loading-spinner ${className || ""}`}>
      {renderContent()}
      {text && (
        <Typography className="loading-text" variant="body2">
          {text}
        </Typography>
      )}
    </Box>
  );
};

export default LoadingSpinner;
