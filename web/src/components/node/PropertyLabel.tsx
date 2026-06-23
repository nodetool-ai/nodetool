/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useContext, useMemo } from "react";
import { titleizeString } from "../../utils/titleizeString";
import isEqual from "fast-deep-equal";
import { Tooltip, SPACING, getSpacingPx } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { TypeMetadata } from "../../stores/ApiTypes";
import HandleTooltip from "../HandleTooltip";
import { useTheme } from "@mui/material/styles";
import { useEditorScope } from "../editor_ui";
import {
  useInspectorHeaderActions,
  useInspectorHeaderReset,
  useInspectorHeaderSupplemental
} from "../../contexts/InspectorPropertyHeaderContext";
import { FlexRow } from "../ui_primitives";
import { PropertyHandleTooltipContext } from "../../contexts/PropertyHandleTooltipContext";

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
  handleTooltipType?: TypeMetadata;
  handleTooltipPosition?: "left" | "right";
}

const PropertyLabel: React.FC<PropertyLabelProps> = ({
  id,
  name,
  description,
  showTooltip = true,
  isDynamicProperty = false,
  density = "normal",
  showDescriptionInline = false,
  handleTooltipType,
  handleTooltipPosition = "left"
}) => {
  const theme = useTheme();
  const contextHandleTooltipType = useContext(PropertyHandleTooltipContext);
  const resolvedHandleTooltipType = handleTooltipType ?? contextHandleTooltipType;
  const scope = useEditorScope();
  const formattedName = useMemo(() => {
    if (isDynamicProperty) {
      return name;
    }
    return titleizeString(name);
  }, [name, isDynamicProperty]);

  const isInspector = scope === "inspector";
  const headerActions = useInspectorHeaderActions();
  const headerReset = useInspectorHeaderReset();
  const headerSupplemental = useInspectorHeaderSupplemental();
  const hasHeaderActions =
    isInspector &&
    (headerActions != null ||
      headerReset != null ||
      headerSupplemental != null);
  const labelFontSize = isInspector ? theme.fontSizeSmall : theme.fontSizeSmall;
  const labelMarginBottom = density === "compact" ? 0 : theme.spacing(1);
  // Only show inline descriptions when explicitly requested, not automatically in inspector
  const shouldShowInlineDescription = showDescriptionInline && !isInspector;

  const label = (
    <label draggable={false} htmlFor={id}>
      {formattedName}
    </label>
  );

  const labelWithTooltip = resolvedHandleTooltipType ? (
    <HandleTooltip
      typeMetadata={resolvedHandleTooltipType}
      paramName={name}
      handlePosition={handleTooltipPosition}
      variant="property"
    >
      {label}
    </HandleTooltip>
  ) : (
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
                offset: density === "compact" ? [0, 64] : [0, 16]
              }
            }
          ]
        }
      }}
      disableInteractive
    >
      {label}
    </Tooltip>
  );

  const labelBlock = (
    <>
      {hasHeaderActions ? (
        <FlexRow
          className="property-label-row"
          align="center"
          gap={0.5}
          sx={{ width: "100%", minWidth: 0 }}
        >
          <div
            className="property-label-main"
            css={css({ flex: "1 1 auto", minWidth: 0, overflow: "hidden" })}
          >
            {labelWithTooltip}
          </div>
          <FlexRow
            className="property-label-actions inspector-header-toolbar inspector-toolbar-hoverable"
            align="center"
            gap={0.5}
            sx={{ flex: "0 0 auto", flexShrink: 0 }}
          >
            {headerSupplemental}
            {headerReset}
            {headerActions}
          </FlexRow>
        </FlexRow>
      ) : (
        labelWithTooltip
      )}
      {shouldShowInlineDescription && description && (
        <span
          css={css({
            display: "block",
            fontSize: theme.fontSizeSmaller,
            color: theme.vars.palette.text.disabled,
            lineHeight: 1.3,
            marginTop: getSpacingPx(SPACING.micro), // was 1px
            marginBottom: theme.spacing(0.5),
            userSelect: "none",
          })}
        >
          {description}
        </span>
      )}
    </>
  );

  return (
    <div
      className={`property-label${hasHeaderActions ? " property-label-with-actions" : ""}`}
      css={css({
        width: "100%",
        height: "auto",
        padding: 0,
        overflow: "visible",
        flexGrow: 1,
        marginBottom: labelMarginBottom,
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
          margin: 0,
          lineHeight: "1em",
          maxHeight: "2em",
          minHeight: "13px",
          textTransform: "capitalize",
          letterSpacing: "0.01em",
          userSelect: "none"
        },
        ".inspector-header-toolbar .inspector-reset-button": {
          padding: 0,
          margin: 0,
          width: 26,
          height: 26,
          flexShrink: 0,
          "& svg": {
            fontSize: "1.0625rem !important"
          }
        },
        ".inspector-header-toolbar .inspector-reset-button.is-changed": {
          color: theme.vars.palette.common.white,
          opacity: 1
        },
        ".inspector-header-toolbar .inspector-reset-button.is-changed:hover": {
          color: theme.vars.palette.common.white,
          opacity: 0.85
        },
        ".inspector-header-toolbar .inspector-reset-button.Mui-disabled": {
          opacity: 0.5,
          color: theme.vars.palette.text.disabled
        },
        ".inspector-header-toolbar .MuiIconButton-root": {
          padding: 0,
          margin: 0,
          width: 20,
          height: 20
        },
        ".inspector-header-toolbar .MuiIconButton-root svg": {
          fontSize: "var(--fontSizeSmall)"
        },
        ".inspector-header-toolbar .inspector-supplemental-action": {
          width: 22,
          height: 22,
          padding: 0,
          margin: 0,
          flexShrink: 0,
          color: theme.vars.palette.common.white,
          "& svg": {
            fontSize: "0.9375rem !important"
          },
          "&:hover": {
            color: theme.vars.palette.common.white,
            opacity: 0.85,
            backgroundColor: "rgba(255, 255, 255, 0.08)"
          }
        },
        ".inspector-header-toolbar .copy-button:not(.inspector-supplemental-action) svg": {
          fontSize: "0.75rem !important"
        },
        ".inspector-header-toolbar .property-visibility-toggle": {
          width: 22,
          height: 22,
          padding: 0,
          margin: 0,
          flexShrink: 0
        },
        ".inspector-header-toolbar .property-visibility-toggle svg": {
          fontSize: "0.9375rem !important"
        }
      })}
    >
      {labelBlock}
    </div>
  );
};

export default memo(PropertyLabel, isEqual);
