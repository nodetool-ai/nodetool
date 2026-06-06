/** @jsxImportSource @emotion/react */

import { css } from "@emotion/react";

import { useTheme } from "@mui/material/styles";

import type { Theme } from "@mui/material/styles";

import { memo, useCallback, useMemo } from "react";

import ArrowForwardIcon from "@mui/icons-material/ArrowForward";



import { Tooltip, ToolbarIconButton } from "../ui_primitives";

import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

import type { ExposedInputPlacement } from "../../utils/exposedInputs";



/** ArrowForward (→): top-right ↗ and bottom-right ↘ */
const HANDLE_ROTATION_DEG = -45;
const LABELED_ROTATION_DEG = 45;



const styles = (

  theme: Theme,

  placement: ExposedInputPlacement | null

) =>

  css({

    "&.property-visibility-toggle": {

      color:

        placement === null

          ? theme.vars.palette.common.white

          : theme.vars.palette.primary.main,

      "&:hover": {

        color: theme.vars.palette.primary.main

      },

      "& svg": {

        fontSize: "var(--fontSizeNormal)",

        transform:

          placement === "handle"

            ? `rotate(${HANDLE_ROTATION_DEG}deg)`

            : placement === "labeled"

              ? `rotate(${LABELED_ROTATION_DEG}deg)`

              : "none",

        transition: "transform 0.15s ease"

      }

    }

  });



export type ExposedInputPlacementState = ExposedInputPlacement | null;



interface PropertyVisibilityToggleProps {

  /** Current exposure: null = off, handle = top, labeled = bottom. */

  placement: ExposedInputPlacementState;

  /** True when an edge is currently connected to this property's handle. */

  connected?: boolean;

  /** Cycles off → top → bottom → off. */

  onToggle: () => void;

}



const PropertyVisibilityToggle = memo<PropertyVisibilityToggleProps>(

  ({ placement, connected = false, onToggle }) => {

    const theme = useTheme();

    const handleClick = useCallback(() => onToggle(), [onToggle]);



    const title = useMemo(() => {

      if (placement === "handle") {

        return connected

          ? "Input on top (click for bottom; edge stays connected)"

          : "Input on top — click for bottom labeled row";

      }

      if (placement === "labeled") {

        return connected

          ? "Input on bottom (click to hide; disconnects edge)"

          : "Input on bottom — click to hide";

      }

      return "Show as input on top";

    }, [connected, placement]);



    const className = useMemo(() => {

      const parts = ["property-visibility-toggle"];

      if (placement === "handle") {

        parts.push("placement-handle");

      } else if (placement === "labeled") {

        parts.push("placement-labeled");

      }

      return parts.join(" ");

    }, [placement]);



    return (

      <Tooltip title={title} placement="top" delay={TOOLTIP_ENTER_DELAY}>

        <ToolbarIconButton

          tabIndex={-1}

          ariaLabel={title}

          className={className}

          css={styles(theme, placement)}

          sx={

            placement === null

              ? { color: theme.vars.palette.common.white }

              : undefined

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


