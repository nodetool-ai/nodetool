/**
 * TabGroup Component
 *
 * A themed tab group wrapping MUI Tabs/Tab for consistent tab navigation.
 * Replaces direct MUI Tab/Tabs usage in 5+ files.
 */

import React from "react";
import { Tabs, Tab, TabsProps, Box, BoxProps } from "@mui/material";
import { useTheme } from "@mui/material/styles";

export interface TabItem {
  /** Unique value for the tab */
  value: string;
  /** Display label */
  label: string;
  /** Optional icon */
  icon?: React.ReactElement;
  /** Whether the tab is disabled */
  disabled?: boolean;
}

export interface TabGroupProps extends Omit<TabsProps, 'onChange'> {
  /** Tab items */
  tabs: TabItem[];
  /** Currently selected tab value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
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
  size = "medium",
  fullWidth = false,
  sx,
  ...props
}) => {
  const theme = useTheme();

  const handleChange = (_: React.SyntheticEvent, newValue: string) => {
    onChange(newValue);
  };

  const isSmall = size === "small";

  return (
    <Tabs
      value={value}
      onChange={handleChange}
      variant={fullWidth ? "fullWidth" : "scrollable"}
      scrollButtons="auto"
      sx={{
        minHeight: isSmall ? "36px" : "42px",
        "& .MuiTabs-indicator": {
          height: "2px",
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
          label={tab.label}
          icon={tab.icon}
          disabled={tab.disabled}
          iconPosition="start"
          sx={{
            minWidth: "auto",
            minHeight: isSmall ? "36px" : "42px",
            padding: isSmall ? "6px 12px" : "8px 16px",
            fontSize: isSmall ? "11px" : "13px",
            fontWeight: 600,
            textTransform: "none",
            color: theme.vars.palette.text.secondary,
            "&.Mui-selected": {
              color: theme.vars.palette.primary.main,
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
