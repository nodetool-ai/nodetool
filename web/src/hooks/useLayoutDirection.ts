import { Position } from "@xyflow/react";
import { useSettingsStore } from "../stores/SettingsStore";

/**
 * Hook that provides layout direction utilities for node positioning.
 * Returns the current layout direction and computed handle positions
 * based on whether the layout is horizontal or vertical.
 */
export const useLayoutDirection = () => {
  const layoutDirection = useSettingsStore((s) => s.settings.layoutDirection);
  const verticalModeHideProperties = useSettingsStore(
    (s) => s.settings.verticalModeHideProperties
  );
  const isVertical = layoutDirection === "vertical";

  return {
    layoutDirection,
    isVertical,
    verticalModeHideProperties,
    inputPosition: isVertical ? Position.Top : Position.Left,
    outputPosition: isVertical ? Position.Bottom : Position.Right,
    toolbarPosition: isVertical ? Position.Left : Position.Top
  };
};

/**
 * Non-hook version for use in non-component contexts.
 * Gets the current layout direction from the store.
 */
export const getLayoutDirection = () => {
  const state = useSettingsStore.getState();
  const layoutDirection = state.settings.layoutDirection;
  const isVertical = layoutDirection === "vertical";
  
  return {
    layoutDirection,
    isVertical,
    inputPosition: isVertical ? Position.Top : Position.Left,
    outputPosition: isVertical ? Position.Bottom : Position.Right
  };
};
