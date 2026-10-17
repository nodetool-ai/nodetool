/**
 * TabGroup Component
 *
 * A themed tab group wrapping MUI Tabs/Tab for consistent tab navigation.
 * Replaces direct MUI Tab/Tabs usage in 5+ files.
 */

import React from "react";
import { Tabs, Tab, TabsProps, Box, BoxProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { CONTROL, FONT_SIZE_SANS, MOTION, TYPOGRAPHY, reducedMotion } from "./tokens";
import { SPACING, getSpacingPx } from "./spacing";

export interface TabItem {
  /** Unique value for the tab */
  value: string;
  /** Display label */
  label: string;
  /** Optional icon */
  icon?: React.ReactElement;
  /** Whether the tab is disabled */
  disabled?: boolean;
  /**
   * A count shown after the label in the caption mono style (muted, primary
   * when selected). Omit it to draw no count.
   */
  count?: number;
}

export interface TabGroupProps extends Omit<TabsProps, 'onChange' | 'value'> {
  /** Tab items */
  tabs: TabItem[];
  /** Currently selected tab value, or `false` when no tab is selected */
  value: string | false;
  /** Change handler */
  onChange: (value: string) => void;
  /**
   * Called when the already-selected tab is clicked again (MUI does not fire
   * `onChange` then). Use it for a strip whose tabs also collapse their panel.
   */
  onReselect?: (value: string) => void;
  /** Size variant */
  size?: "small" | "medium";
  /** Full width tabs */
  fullWidth?: boolean;
}

export interface TabPanelProps extends BoxProps {
  /** Panel value (must match a tab value) */
  value: string;
  /** Currently active tab value */
  activeValue: string;
}

/**
 * TabGroup - A themed tab navigation component
 *
 * @example
 * // Basic tabs
 * <TabGroup
 *   tabs={[
 *     { value: "tab1", label: "First" },
 *     { value: "tab2", label: "Second" },
 *   ]}
 *   value={activeTab}
 *   onChange={setActiveTab}
 * />
 *
 * @example
 * // Small tabs
 * <TabGroup tabs={tabs} value={active} onChange={setActive} size="small" />
 */
export const TabGroup: React.FC<TabGroupProps> = ({
  tabs,
  value,
  onChange,
  onReselect,
  size = "medium",
  fullWidth = false,
  orientation = "horizontal",
  sx,
  ...props
}) => {
  const theme = useTheme();

  const handleChange = (_: React.SyntheticEvent, newValue: string) => {
    onChange(newValue);
  };

  const isSmall = size === "small";
  const isVertical = orientation === "vertical";

  return (
    <Tabs
      value={value}
      onChange={handleChange}
      orientation={orientation}
      variant={fullWidth ? "fullWidth" : "scrollable"}
      scrollButtons="auto"
      sx={{
        minHeight: isSmall ? `${CONTROL.height.lg}px` : "40px",
        // Small tabs sit in docked panels whose body pads SPACING.lg: this
        // inset plus the tab padding puts the first icon on that edge.
        ...(isSmall && !isVertical && {
          paddingLeft: getSpacingPx(SPACING.xs),
          paddingRight: getSpacingPx(SPACING.xs),
        }),
        "& .MuiTabs-indicator": {
          ...(isVertical ? { width: "2px" } : { height: "2px" }),
          backgroundColor: theme.vars.palette.primary.main,
        },
        ...sx,
      }}
      {...props}
    >
      {tabs.map((tab) => (
        <Tab
          key={tab.value}
          value={tab.value}
          label={
            tab.count === undefined ? (
              tab.label
            ) : (
              <>
                <span className="tab-group-label">{tab.label}</span>
                <span className="tab-group-count">{tab.count}</span>
              </>
            )
          }
          icon={tab.icon}
          disabled={tab.disabled}
          iconPosition="start"
          onClick={
            onReselect && tab.value === value
              ? () => onReselect(tab.value)
              : undefined
          }
          sx={{
            minWidth: "auto",
            minHeight: isSmall ? `${CONTROL.height.lg}px` : "40px",
            padding: isSmall
              ? `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.md)}`
              : `${getSpacingPx(SPACING.md)} ${getSpacingPx(SPACING.xl)}`,
            // Small tabs sit in docked panels: an icon at the default 24px
            // and wide padding pushed a fourth tab out of a 360px panel.
            // Body size keeps the icon close to the 13px label it marks.
            ...(isSmall && {
              "& .MuiTab-iconWrapper": {
                fontSize: FONT_SIZE_SANS.body,
                marginRight: getSpacingPx(SPACING.sm),
              },
            }),
            // Tabs are controls: the sanctioned label style at both sizes.
            ...TYPOGRAPHY.sans.label,
            textTransform: "none",
            color: theme.vars.palette.text.secondary,
            transition: MOTION.all,
            ...reducedMotion({ transition: MOTION.none }),
            "& .tab-group-count": {
              ...TYPOGRAPHY.mono.caption,
              marginLeft: getSpacingPx(SPACING.sm),
              color: theme.vars.palette.text.disabled,
              fontVariantNumeric: "tabular-nums",
            },
            "&.Mui-selected": {
              color: theme.vars.palette.primary.main,
              "& .tab-group-count": { color: theme.vars.palette.primary.main },
            },
          }}
        />
      ))}
    </Tabs>
  );
};

TabGroup.displayName = "TabGroup";

/**
 * TabPanel - Content panel that shows/hides based on active tab
 *
 * @example
 * <TabPanel value="tab1" activeValue={activeTab}>
 *   <Typography>Content for tab 1</Typography>
 * </TabPanel>
 */
export const TabPanel: React.FC<TabPanelProps> = ({
  value,
  activeValue,
  children,
  sx,
  ...props
}) => {
  if (value !== activeValue) {return null;}

  return (
    <Box
      role="tabpanel"
      sx={{ py: 1, ...sx }}
      {...props}
    >
      {children}
    </Box>
  );
};

TabPanel.displayName = "TabPanel";
