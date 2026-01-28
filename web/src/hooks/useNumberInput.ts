import React, { useCallback } from "react";
import {
  InputProps,
  NumberInputState,
  DRAG_THRESHOLD,
  DRAG_SLOWDOWN_DEAD_ZONE_PX
} from "../components/inputs/NumberInput";
import {
  calculateStep,
  calculateDecimalPlaces,
  calculateSpeedFactor,
  applyValueConstraints
} from "../components/inputs/NumberInput.utils";

// Multiplier for drag speed when inputs are unbounded.
// Slightly higher value keeps the feel responsive without huge jumps.
const UNBOUNDED_DRAG_SCALE = 0.25;

/**
 * Hook providing value calculation utilities for number input components.
 * Memoizes step and decimal place calculations to prevent unnecessary recalculations.
 * 
 * @returns Object containing memoized calculation functions
 * 
 * @example
 * ```typescript
 * const { calculateStep, calculateDecimalPlaces } = useValueCalculation();
 * const step = calculateStep(0, 100, "float");
 * ```
 */

/**
 * Hook for handling mouse drag interactions on number input fields.
 * Provides sophisticated drag-to-change functionality including:
 * - Drag threshold detection to distinguish between clicks and drags
 * - Speed control based on vertical mouse position (slowdown dead zone)
 * - Shift key support for fine-grained adjustments
 * - Step calculation based on input constraints
 * - Value constraint application (min/max bounds)
 * 
 * The drag handling implements an "incremental dragging" pattern where the value
 * is updated based on pixel movement rather than absolute position, providing
 * a natural feel regardless of the value range.
 * 
 * @param props - Input configuration including min, max, step, onChange callbacks
 * @param state - Current number input state
 * @param setState - State setter for the number input
 * @param inputIsFocused - Whether the input field has focus
 * @param setInputIsFocused - Callback to set input focus state
 * @param containerRef - Reference to the input container element
 * @param dragStateRef - Mutable ref tracking drag state across renders
 * @param setSpeedFactorState - Callback to update speed factor display for debugging
 * @returns Object containing handleMouseMove and handleMouseUp callbacks
 * 
 * @example
 * ```typescript
 * const { handleMouseMove, handleMouseUp } = useDragHandling(
 *   props,
 *   state,
 *   setState,
 *   inputIsFocused,
 *   setInputIsFocused,
 *   containerRef,
 *   dragStateRef,
 *   setSpeedFactorState
 * );
 * ```
 * 
 * **Drag Behavior**:
 * - Move mouse horizontally to change value
 * - Move mouse vertically outside dead zone to slow down changes
 * - Hold Shift for 10x finer control
 * - Drag threshold (5px) prevents accidental drags
 * - Release to commit changes and trigger onChangeComplete
 */
export const useValueCalculation = () => {
  const calculateStepCb = useCallback(calculateStep, []);
  const calculateDecimalPlacesCb = useCallback(calculateDecimalPlaces, []);
  return {
    calculateStep: calculateStepCb,
    calculateDecimalPlaces: calculateDecimalPlacesCb
  };
};

export const useDragHandling = (
  props: InputProps,
  state: NumberInputState,
  setState: React.Dispatch<React.SetStateAction<NumberInputState>>,
  inputIsFocused: boolean,
  setInputIsFocused: (focused: boolean) => void,
  containerRef: React.RefObject<HTMLDivElement>,
  dragStateRef: React.MutableRefObject<NumberInputState>,
  setSpeedFactorState: React.Dispatch<React.SetStateAction<number>>
) => {
  const { calculateStep, calculateDecimalPlaces } = useValueCalculation();

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragStateRef.current.isDragging) {return;}

      const { dragStartX, currentDragValue, decimalPlaces, lastClientX } =
        dragStateRef.current;

      const moveX = e.clientX - dragStartX;
      if (
        !dragStateRef.current.hasExceededDragThreshold &&
        Math.abs(moveX) > DRAG_THRESHOLD
      ) {
        dragStateRef.current.hasExceededDragThreshold = true;
        setInputIsFocused(false);
      }

      // Ignore tiny drags that haven't crossed the threshold yet
      if (!dragStateRef.current.hasExceededDragThreshold) {
        dragStateRef.current.lastClientX = e.clientX;
        return;
      }

      if (!containerRef.current) {return;}

      const rect = containerRef.current.getBoundingClientRect();

      const isOverSlider = e.clientY >= rect.top && e.clientY <= rect.bottom;
      const isWithinDeadZone =
        e.clientY >= rect.top - DRAG_SLOWDOWN_DEAD_ZONE_PX &&
        e.clientY <= rect.bottom + DRAG_SLOWDOWN_DEAD_ZONE_PX;

      // 1) Compute speedFactor for this frame --------------------------------
      let distanceOutside = 0;
      if (!isWithinDeadZone) {
        distanceOutside = Math.max(
          0,
          e.clientY < rect.top - DRAG_SLOWDOWN_DEAD_ZONE_PX
            ? rect.top - DRAG_SLOWDOWN_DEAD_ZONE_PX - e.clientY
            : e.clientY - (rect.bottom + DRAG_SLOWDOWN_DEAD_ZONE_PX)
        );
      }

      const speedFactor = calculateSpeedFactor(distanceOutside, e.shiftKey);

      // expose to overlay/debug
      setSpeedFactorState(speedFactor);

      //---------------------------------------------------------------------

      const baseStep = calculateStep(
        props.min,
        props.max,
        props.inputType || "float"
      );

      // Use smaller step size when Shift is pressed for finer control
      const effectiveStep = e.shiftKey ? baseStep / 10 : baseStep;

      // Always use incremental dragging logic to prevent value jumping
      const deltaX = e.clientX - lastClientX;

      let newValue: number;
      if (Math.abs(deltaX) < 0.5) {
        newValue = currentDragValue;
      } else {
        // Step 1: Convert pixel movement to visual percentage using actual slider width only
        const { actualSliderWidth } = dragStateRef.current;
        const visualPercentage = deltaX / actualSliderWidth;

        // Step 2: Convert to raw value change
        let rawValueChange: number;
        if (typeof props.min === "number" && typeof props.max === "number") {
          const range = props.max - props.min;
          rawValueChange = visualPercentage * range;
        } else {
          rawValueChange = deltaX * effectiveStep * UNBOUNDED_DRAG_SCALE;
        }

        // Step 3: Apply modifiers (speedFactor for vertical slowdown + shift)
        const effectiveSpeedFactor =
          isOverSlider && !e.shiftKey ? 1.0 : speedFactor;
        const finalValueChange = rawValueChange * effectiveSpeedFactor;

        // Step 4: Apply to current value
        newValue = currentDragValue + finalValueChange;
      }

      // Apply decimal places and value constraints
      const newDecimalPlaces =
        props.inputType === "float" ? calculateDecimalPlaces(effectiveStep) : 0;
      if (newDecimalPlaces !== decimalPlaces) {
        dragStateRef.current.decimalPlaces = newDecimalPlaces;
      }

      newValue = applyValueConstraints(
        newValue,
        props.min,
        props.max,
        props.inputType || "float",
        newDecimalPlaces,
        isWithinDeadZone ? effectiveStep : undefined
      );

      if (newValue !== currentDragValue) {
        dragStateRef.current.currentDragValue = newValue;
        dragStateRef.current.lastClientX = e.clientX; // reset anchoring only when value actually changes
        props.onChange(null, newValue);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      // Dependencies are stable or managed by refs
      props.min,
      props.max,
      props.inputType,
      props.onChange,
      calculateStep,
      calculateDecimalPlaces,
      setInputIsFocused,
      containerRef,
      setSpeedFactorState
    ]
  );

  const handleMouseUp = useCallback(() => {
    if (dragStateRef.current.isDragging) {
      const finalValue = dragStateRef.current.currentDragValue;
      dragStateRef.current.isDragging = false;
      // sync final value back to react state
      setState((prev) => ({
        ...prev,
        isDragging: false,
        localValue: String(finalValue)
      }));

      if (!dragStateRef.current.hasExceededDragThreshold) {
        setInputIsFocused(true);
      } else {
        // Call onChangeComplete when user finishes dragging (only if they actually dragged)
        if (props.onChangeComplete) {
          props.onChangeComplete(finalValue);
        }
      }
    }
  }, [setInputIsFocused, dragStateRef, setState, props]);

  return { handleMouseMove, handleMouseUp };
};
