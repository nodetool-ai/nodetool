/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useMemo } from "react";
import { titleizeString } from "../../utils/titleizeString";
import isEqual from "lodash/isEqual";
import { Tooltip } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "../editor_ui";

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
  /**
   * Controls the density/spacing of the label. When "compact", removes the bottom margin.
   * Defaults to "normal".
   */
  density?: "compact" | "normal";
  /**
   * When true, shows the description as inline text below the label instead
   * of only in a tooltip. Useful in the Inspector where there is more space.
   */
  showDescriptionInline?: boolean;
}

const PropertyLabel: React.FC<PropertyLabelProps> = ({
  id,
  name,
  description,
  showTooltip = true,
  isDynamicProperty = false,
  density = "normal",
  showDescriptionInline = false
}) => {
  const theme = useTheme();
  const scope = useEditorScope();
  const formattedName = useMemo(() => {
    if (isDynamicProperty) {
      return name;
    }
    return titleizeString(name);
  }, [name, isDynamicProperty]);

  const isInspector = scope === "inspector";
  const labelFontSize = isInspector ? theme.fontSizeSmall : theme.fontSizeSmall;
  const labelMarginBottom = density === "compact" ? 0 : theme.spacing(0.25);
  // Only show inline descriptions when explicitly requested, not automatically in inspector
  const shouldShowInlineDescription = showDescriptionInline && !isInspector;

  return (
    <div
      className="property-label"
      css={css({
        width: "100%",
        height: "auto",
        padding: 0,
        overflow: "visible",
        flexGrow: 1,
        "&:hover": {
          "& label": {
            opacity: 0.94
          }
        },
        "& label": {
          display: "block",
          fontWeight: 500,
          fontSize: labelFontSize,
          color: theme.vars.palette.text.secondary,
          padding: 0,
          margin: `0 0 ${labelMarginBottom} 0`,
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
        delay={TOOLTIP_ENTER_DELAY * 2}
        nextDelay={TOOLTIP_ENTER_DELAY}
        placement="left"
        slotProps={{
          tooltip: {
            sx: {
              fontSize: theme.fontSizeSmall + " !important",
              color: theme.vars.palette.common.white
            }
          },
          popper: {
            modifiers: [
              {
                name: "offset",
                options: {
                  offset: density === "compact" ? [0, 64] : [0, 16] // [skidding, distance] - distance pushes tooltip further left
                }
              }
            ]
          }
        }}
        disableInteractive
      >
        <label draggable={false} htmlFor={id}>
          {formattedName}
        </label>
      </Tooltip>
      {shouldShowInlineDescription && description && (
        <span
          css={css({
            display: "block",
            fontSize: theme.fontSizeSmaller,
            color: theme.vars.palette.text.disabled,
            lineHeight: 1.3,
            marginTop: "1px",
            marginBottom: theme.spacing(0.5),
            userSelect: "none",
          })}
        >
          {description}
        </span>
      )}
    </div>
  );
};

export default memo(PropertyLabel, isEqual);
