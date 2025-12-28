/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useMemo } from "react";
import { titleizeString } from "../../utils/titleizeString";
import isEqual from "lodash/isEqual";
import Tooltip from "@mui/material/Tooltip";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useEditorTokens } from "../editor_ui";

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
  const tokens = useEditorTokens();
  const formattedName = useMemo(() => {
    if (isDynamicProperty) {
      return name;
    }
    return titleizeString(name);
  }, [name, isDynamicProperty]);

  return (
    <div
      className="property-label"
      css={css({
        width: "100%",
        height: "auto",
        padding: 0,
        overflow: "visible",
        flexGrow: 1,

        "& label": {
          display: "block",
          fontWeight: 500,
          fontSize: tokens.text.labelSize,
          color: tokens.text.colorSecondary,
          padding: 0,
          margin: "0 0 4px 0",
          lineHeight: "1em",
          maxHeight: "2em",
          minHeight: "13px",
          textTransform: "capitalize",
          letterSpacing: "0.01em",
          userSelect: "none"
        }
      })}
    >
      <Tooltip
        title={showTooltip ? description || "" : ""}
        enterDelay={TOOLTIP_ENTER_DELAY}
        placement="left"
        disableInteractive
      >
        <label draggable={false} htmlFor={id}>
          {formattedName}
        </label>
      </Tooltip>
    </div>
  );
};

export default memo(PropertyLabel, isEqual);
