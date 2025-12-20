/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { titleizeString } from "../../utils/titleizeString";
import isEqual from "lodash/isEqual";
import Tooltip from "@mui/material/Tooltip";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

interface PropertyLabelProps {
  id: string;
  name: string;
  description?: string | null;
  isDynamicProperty?: boolean;
  /**
   * Whether to display the tooltip. Defaults to true. When set to false the
   * tooltip content is omitted so nothing is rendered when the user hovers
   * the label.
   */
  showTooltip?: boolean;
}

const PropertyLabel: React.FC<PropertyLabelProps> = ({
  id,
  name,
  description,
  showTooltip = true,
  isDynamicProperty = false
}) => {
  const formattedName = useMemo(() => {
    if (isDynamicProperty) {
      return name;
    }
    return titleizeString(name);
  }, [name, isDynamicProperty]);

  return (
    <div className="property-label">
      <Tooltip
        // open={true}
        title={showTooltip ? description || "" : ""}
        enterDelay={TOOLTIP_ENTER_DELAY}
        placement="left"
        sx={{
          maxWidth: "50px",
          backgroundColor: "red",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        <label draggable={false} htmlFor={id}>
          {formattedName}
        </label>
      </Tooltip>
    </div>
  );
};

export default memo(PropertyLabel, isEqual);
