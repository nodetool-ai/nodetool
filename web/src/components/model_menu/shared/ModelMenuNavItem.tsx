import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";

import {
  Caption,
  Chip,
  CONTROL,
  FlexRow,
  ListItemButton,
  SPACING,
  Text,
  Tooltip,
  selectableRowStyles,
  selectedRowStyles
} from "../../ui_primitives";

interface ModelMenuNavItemProps {
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  /** Number of models behind the entry, shown at the end of the row. */
  count?: number;
  /** Replaces the count, e.g. a missing-key warning. */
  trailing?: React.ReactNode;
  /** A disabled provider: still selectable, drawn in `text.disabled`. */
  dimmed?: boolean;
  /** Explains a dimmed or flagged entry. */
  tooltip?: string;
  /** "horizontal" draws a filter chip for the mobile strip. */
  orientation?: "vertical" | "horizontal";
  className?: string;
  onContextMenu?: (event: React.MouseEvent<HTMLElement>) => void;
  "data-provider"?: string;
}

/**
 * One entry in the model picker's sidebar: All models, Favorites, Recent or a
 * provider. A list row on desktop, a filter chip in the mobile strip.
 */
const ModelMenuNavItem: React.FC<ModelMenuNavItemProps> = ({
  label,
  icon,
  selected,
  onClick,
  count,
  trailing,
  dimmed = false,
  tooltip,
  orientation = "vertical",
  className,
  onContextMenu,
  "data-provider": dataProvider
}) => {
  const theme = useTheme();

  if (orientation === "horizontal") {
    return (
      <Chip
        className={className}
        label={label}
        icon={
          <FlexRow
            align="center"
            sx={{ "& svg, & img": { width: 14, height: 14 } }}
          >
            {icon}
          </FlexRow>
        }
        compact
        active={selected}
        onClick={onClick}
        onContextMenu={onContextMenu}
        data-provider={dataProvider}
        sx={{ flexShrink: 0, opacity: dimmed ? 0.6 : 1 }}
      />
    );
  }

  const row = (
    <ListItemButton
      disableRipple
      className={className}
      selected={selected}
      onClick={onClick}
      onContextMenu={onContextMenu}
      data-provider={dataProvider}
      sx={{
        ...selectableRowStyles(theme, { selected }),
        "&.Mui-selected": selectedRowStyles(theme),
        minHeight: CONTROL.height.md,
        px: SPACING.md,
        py: 0,
        gap: SPACING.md,
        flexGrow: 0
      }}
    >
      <FlexRow
        align="center"
        justify="center"
        sx={{
          width: 16,
          height: 16,
          flexShrink: 0,
          color: dimmed ? "text.disabled" : "text.secondary",
          opacity: dimmed ? 0.6 : 1,
          "& svg, & img": { width: 16, height: 16 }
        }}
      >
        {icon}
      </FlexRow>
      <Text
        size="small"
        weight={500}
        truncate
        sx={{
          flex: 1,
          minWidth: 0,
          color: dimmed ? "text.disabled" : "text.primary"
        }}
      >
        {label}
      </Text>
      {trailing ??
        (count !== undefined && count > 0 && (
          <Caption sx={{ color: "text.secondary", flexShrink: 0 }}>
            {count}
          </Caption>
        ))}
    </ListItemButton>
  );

  return tooltip ? (
    <Tooltip title={tooltip} placement="right">
      {row}
    </Tooltip>
  ) : (
    row
  );
};

export default memo(ModelMenuNavItem);
