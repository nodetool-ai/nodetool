/** @jsxImportSource @emotion/react */
import React, { useMemo } from "react";
import { css } from "@emotion/react";
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
      bottom: "2.2em",
      top: "unset",
      left: "-3px",
      transform: "none",
      backgroundColor: theme.palette.c_gray1,
      color: theme.palette.c_white,
      fontFamily: theme.fontFamily1,
      lineHeight: "1.2em",
      padding: ".5em .75em",
      display: "block",
      maxWidth: "250px",
      wordWrap: "break-word",
      whiteSpace: "normal",
      fontSize: theme.fontSizeTiny,
      pointerEvents: "none",
      transition:
        "all var(--microtip-transition-duration) var(--microtip-transition-easing) .1s"
    }
  });

const PropertyLabel: React.FC<PropertyLabelProps> = React.memo(({
  id,
  name,
  description
}) => {
  const formattedName = useMemo(() => name.replaceAll("_", " "), [name]);

  return (
    <div className="property-label" css={labelStyles}>
      {description ? (
        <div
          aria-label={description}
          data-microtip-position="bottom"
          role="tooltip"
        >
          <InputLabel draggable={false} htmlFor={id}>
            {formattedName}
          </InputLabel>
        </div>
      ) : (
        <InputLabel draggable={false} htmlFor={id}>
          {formattedName}
        </InputLabel>
      )}
    </div>
  );
});

PropertyLabel.displayName = 'PropertyLabel';

export default PropertyLabel;
