/** @jsxImportSource @emotion/react */
import React, { memo, useMemo } from "react";
import { titleizeString } from "../../utils/titleizeString";
import { isEqual } from "lodash";
import Tooltip from "@mui/material/Tooltip";

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
      <Tooltip title={description || ""} enterDelay={400} placement="left">
        <label draggable={false} htmlFor={id}>
          {formattedName}
        </label>
      </Tooltip>
    </div>
  );
};

export default memo(PropertyLabel, isEqual);
