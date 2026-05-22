/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import { Tooltip, ToolbarIconButton } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const styles = (theme: Theme, exposed: boolean) =>
  css({
    "&.property-visibility-toggle": {
      color: exposed
        ? theme.vars.palette.primary.main
        : theme.vars.palette.common.white,
      "&:hover": {
        color: theme.vars.palette.primary.main
      },
      "& svg": { fontSize: exposed ? 16 : 18 }
    }
  });

interface PropertyVisibilityToggleProps {
  /** True when the property is currently exposed as an input handle. */
  exposed: boolean;
  /** True when an edge is currently connected to this property's handle. */
  connected?: boolean;
  /** Click handler. Implementations should confirm before demoting a
   *  currently-connected handle (would disconnect the edge). */
  onToggle: () => void;
}

/**
 * Inspector-side toggle that promotes an advanced property to a visible
 * input handle on the node body (plan §8.4). Off by default; on after
 * either an explicit click or auto-promotion from a connected edge.
 */
const PropertyVisibilityToggle = memo<PropertyVisibilityToggleProps>(
  ({ exposed, connected = false, onToggle }) => {
    const theme = useTheme();
    const handleClick = useCallback(() => onToggle(), [onToggle]);
    const title = exposed
      ? connected
        ? "Hide input handle (disconnects edge)"
        : "Hide input handle"
      : "Show as input handle";
    return (
      <Tooltip title={title} placement="top" delay={TOOLTIP_ENTER_DELAY}>
        <ToolbarIconButton
          tabIndex={-1}
          ariaLabel={title}
          className={`property-visibility-toggle${exposed ? " exposed" : ""}`}
          css={styles(theme, exposed)}
          sx={
            exposed
              ? undefined
              : { color: theme.vars.palette.common.white }
          }
          onClick={handleClick}
          icon={<ArrowForwardIcon />}
        />
      </Tooltip>
    );
  }
);

PropertyVisibilityToggle.displayName = "PropertyVisibilityToggle";

export default PropertyVisibilityToggle;
