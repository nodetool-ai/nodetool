/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { css } from "@emotion/react";
import InputLabel from "@mui/material/InputLabel";
import { titleizeString } from "../../utils/titleizeString";
import { isEqual } from "lodash";
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

const PropertyLabel: React.FC<PropertyLabelProps> = ({
  id,
  name,
  description
}) => {
  const formattedName = useMemo(() => {
    return titleizeString(name);
  }, [name]);

  return (
    <div className="property-label">
      <label draggable={false} htmlFor={id} title={description ?? ""}>
        {formattedName}
      </label>
    </div>
  );
};

export default memo(PropertyLabel, isEqual);
