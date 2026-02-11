/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { IconButton, Tooltip } from "@mui/material";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { memo, useMemo } from "react";

const styles = (theme: Theme, isBypassed: boolean) =>
  css({
    "&.bypass-button": {
      width: 28,
      height: 28,
      padding: 0,
      borderRadius: "50%",
      backgroundColor: isBypassed
        ? theme.vars.palette.warning.dark
        : "transparent",
      border: `1px solid ${isBypassed ? theme.vars.palette.warning.main : theme.vars.palette.grey[600]}`,
      color: isBypassed
        ? theme.vars.palette.warning.contrastText
        : theme.vars.palette.grey[400],
      transition: "all 0.15s ease",
      "&:hover": {
        backgroundColor: isBypassed
          ? theme.vars.palette.warning.main
          : theme.vars.palette.grey[800],
        color: theme.vars.palette.grey[100],
        borderColor: isBypassed
          ? theme.vars.palette.warning.light
          : theme.vars.palette.grey[500]
      },
      "& svg": {
        fontSize: 16
      }
    }
  });

interface BypassGroupButtonProps {
  isBypassed: boolean;
  onClick: () => void;
}

const BypassGroupButton: React.FC<BypassGroupButtonProps> = memo(({
  isBypassed,
  onClick
}) => {
  const theme = useTheme();

  const tooltipContainerStyles = useMemo(
    () => ({
      display: "flex" as const,
      flexDirection: "column" as const,
      alignItems: "center" as const,
      gap: "0.1em",
    }),
    []
  );

  const titleTextStyles = useMemo(
    () => ({
      fontSize: "1.1em",
      color: "white",
    }),
    []
  );

  const shortcutStyles = useMemo(
    () => ({
      fontSize: ".85em",
      color: "rgba(255,255,255,0.7)",
    }),
    []
  );

  const buttonStyles = useMemo(
    () => styles(theme, isBypassed),
    [theme, isBypassed]
  );

  return (
    <Tooltip
      title={
        <div
          className="tooltip-span"
          style={tooltipContainerStyles}
        >
          <span style={titleTextStyles}>
            {isBypassed ? "Enable All Nodes" : "Bypass All Nodes"}
          </span>
          <span style={shortcutStyles}>
            <kbd>B</kbd>
          </span>
        </div>
      }
      enterDelay={TOOLTIP_ENTER_DELAY}
    >
      <IconButton
        size="small"
        tabIndex={-1}
        css={buttonStyles}
        className="bypass-button"
        onClick={onClick}
      >
        {isBypassed ? <VisibilityIcon /> : <VisibilityOffIcon />}
      </IconButton>
    </Tooltip>
  );
});

BypassGroupButton.displayName = "BypassGroupButton";

export default BypassGroupButton;

