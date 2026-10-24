/**
 * ModeSwitch
 *
 * The one mode control of a document bar: a segmented `ToggleGroup` with an
 * option per mode. `iconOnly` draws each option as its icon and moves the
 * label into the tooltip and the accessible name, as the View/Edit switch
 * does.
 *
 * @example
 * <ModeSwitch
 *   ariaLabel="Document mode"
 *   value={mode}
 *   onChange={setMode}
 *   iconOnly
 *   options={[
 *     { value: "view", label: "View", icon: <VisibilityOutlinedIcon /> },
 *     { value: "edit", label: "Edit", icon: <EditOutlinedIcon /> }
 *   ]}
 * />
 */

import React, { memo } from "react";

import { ToggleGroup, ToggleOption } from "./ToggleGroup";
import { Tooltip } from "./Tooltip";
import { CONTROL } from "./tokens";

export interface ModeSwitchOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  /** Keyboard shortcut shown in the tooltip, e.g. ["Alt", "M"]. */
  shortcut?: string[];
}

export interface ModeSwitchProps<T extends string> {
  options: readonly ModeSwitchOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  ariaLabel: string;
  /** Draw icons only; each label moves into its tooltip. */
  iconOnly?: boolean;
  className?: string;
}

const ModeSwitchInternal = <T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  iconOnly = false,
  className
}: ModeSwitchProps<T>) => (
  <ToggleGroup
    segmented
    exclusive
    className={className}
    value={value}
    aria-label={ariaLabel}
    onChange={(_event, next: T | null) => {
      // A click on the picked option must not clear the mode.
      if (next !== null) {
        onChange(next);
      }
    }}
    sx={{
      height: CONTROL.height.sm,
      flexShrink: 0,
      ...(iconOnly && {
        // Not `.MuiToggleButton-root`: that key would replace the
        // segmented look instead of adding to it.
        // The picked icon takes the toolbar on-state colour.
        "& .MuiToggleButtonGroup-grouped": {
          px: 0,
          width: CONTROL.height.sm,
          "&.Mui-selected": { color: "primary.main" }
        }
      })
    }}
  >
    {options.map((option) => (
      <Tooltip
        key={option.value}
        title={option.label}
        shortcut={option.shortcut}
        disabled={!iconOnly && !option.shortcut}
      >
        <ToggleOption
          value={option.value}
          aria-label={option.label}
          icon={option.icon}
        >
          {iconOnly ? null : option.label}
        </ToggleOption>
      </Tooltip>
    ))}
  </ToggleGroup>
);

export const ModeSwitch = memo(ModeSwitchInternal) as typeof ModeSwitchInternal;
