import React, { useCallback, useRef } from "react";
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
  applyValueConstraints,
  formatFloat
} from "../components/inputs/NumberInput.utils";

// Multiplier for drag speed when inputs are unbounded.
// Slightly higher value keeps the feel responsive without huge jumps.
const UNBOUNDED_DRAG_SCALE = 0.25;

/** Hook providing value calculation utilities for number input components. */

/** Hook for handling mouse drag interactions on number input fields. */
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
  const propsRef = useRef(props);
  propsRef.current = props;

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragStateRef.current.isDragging) {return;}
      const p = propsRef.current;

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
        p.onChange(null, newValue);
      }
    },
    [
      calculateStep,
      calculateDecimalPlaces,
      setInputIsFocused,
      containerRef,
      setSpeedFactorState,
      dragStateRef,
      props.max,
      props.min,
      props.inputType
    ]
  );

  const handleMouseUp = useCallback(() => {
    if (dragStateRef.current.isDragging) {
      const p = propsRef.current;
      const finalValue = dragStateRef.current.currentDragValue;
      dragStateRef.current.isDragging = false;
      // sync final value back to react state
      setState((prev) => ({
        ...prev,
        isDragging: false,
        localValue:
          p.inputType === "float"
            ? formatFloat(finalValue)
            : String(finalValue)
      }));

      if (!dragStateRef.current.hasExceededDragThreshold) {
        setInputIsFocused(true);
      } else {
        // Call onChangeComplete when user finishes dragging (only if they actually dragged)
        if (p.onChangeComplete) {
          p.onChangeComplete(finalValue);
        }
      }
    }
  }, [setInputIsFocused, dragStateRef, setState]);

  return { handleMouseMove, handleMouseUp };
};
