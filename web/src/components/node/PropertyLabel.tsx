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

const PropertyLabel: React.FC<PropertyLabelProps> = React.memo(
  ({ id, name, description }) => {
    const formattedName = useMemo(() => {
      return name
        .split("_")
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join(" ");
    }, [name]);

    return (
      <div className="property-label">
        {description ? (
          <div
            aria-label={description}
            data-microtip-position="bottom"
            role="tooltip"
          >
            <label draggable={false} htmlFor={id}>
              {formattedName}
            </label>
          </div>
        ) : (
          <label draggable={false} htmlFor={id}>
            {formattedName}
          </label>
        )}
      </div>
    );
  }
);

PropertyLabel.displayName = "PropertyLabel";

export default PropertyLabel;
