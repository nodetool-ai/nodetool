/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React from "react";
import InputLabel from "@mui/material/InputLabel";
// import Tooltip from "@mui/material/Tooltip";
// import {
//   TOOLTIP_ENTER_DELAY,
//   TOOLTIP_LEAVE_DELAY,
//   TOOLTIP_ENTER_NEXT_DELAY
// } from "./BaseNode";

interface PropertyLabelProps {
  id: string;
  name: string;
  description?: string | null;
}

const labelStyles = (theme: any) =>
  css({
    '[role~="tooltip"][data-microtip-position|="bottom"]::before': {
      background: "none"
    },
    '[role~="tooltip"][data-microtip-position|="bottom"]::after': {
      position: "absolute",
      bottom: "2.5em",
      top: "unset",
      left: "-3px",
      transform: "none",
      backgroundColor: theme.palette.c_gray1,
      color: theme.palette.c_white,
      fontFamily: theme.fontFamily1,
      lineHeight: "1.1em",
      padding: ".5em 1em",
      display: "block",
      maxWidth: "250px",
      wordWrap: "break-word",
      whiteSpace: "normal",
      fontSize: ".6em",
      pointerEvents: "none",
      transition:
        "all var(--microtip-transition-duration) var(--microtip-transition-easing) .1s"
    }
  });

const PropertyLabel: React.FC<PropertyLabelProps> = ({
  id,
  name,
  description
}) => {
  return (
    <div className="property-label" css={labelStyles}>
      {description ? (
        <div
          aria-label={description}
          data-microtip-position="bottom"
          role="tooltip"
        >
          <InputLabel htmlFor={id}>{name.replaceAll("_", " ")}</InputLabel>
        </div>
      ) : (
        <InputLabel htmlFor={id}>{name.replaceAll("_", " ")}</InputLabel>
      )}
    </div>
  );
};

export default PropertyLabel;
