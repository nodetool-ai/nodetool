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
  getEffectiveSliderWidth,
  applyValueConstraints
} from "../components/inputs/NumberInput.utils";

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
  setSpeedFactorState: React.Dispatch<React.SetStateAction<number>>,
  zoom: number
) => {
  const { calculateStep, calculateDecimalPlaces } = useValueCalculation();

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragStateRef.current.isDragging) return;

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

      if (!containerRef.current) return;

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
        props.min ?? 0,
        props.max ?? 4096,
        props.inputType || "float"
      );

      // Always use incremental dragging logic to prevent value jumping
      const deltaX = e.clientX - lastClientX;

      let newValue: number;
      if (Math.abs(deltaX) < 0.5) {
        newValue = currentDragValue;
      } else {
        // Step 1: Convert pixel movement to visual percentage
        const { actualSliderWidth } = dragStateRef.current;
        const zoomEnabled = props.zoomAffectsDragging !== false; // default to true
        const visualScreenWidth = getEffectiveSliderWidth(
          zoomEnabled,
          zoom,
          actualSliderWidth
        );
        const visualPercentage = deltaX / visualScreenWidth;

        // Step 2: Convert to raw value change
        const range = (props.max ?? 4096) - (props.min ?? 0);
        const rawValueChange = visualPercentage * range;

        // Step 3: Apply modifiers (speedFactor for vertical slowdown + shift)
        const effectiveSpeedFactor =
          isOverSlider && !e.shiftKey ? 1.0 : speedFactor;
        const finalValueChange = rawValueChange * effectiveSpeedFactor;

        // Step 4: Apply to current value
        newValue = currentDragValue + finalValueChange;
      }

      // Apply decimal places and value constraints
      const newDecimalPlaces =
        props.inputType === "float" ? calculateDecimalPlaces(baseStep) : 0;
      if (newDecimalPlaces !== decimalPlaces) {
        dragStateRef.current.decimalPlaces = newDecimalPlaces;
      }

      newValue = applyValueConstraints(
        newValue,
        props.min ?? 0,
        props.max ?? 4096,
        props.inputType || "float",
        newDecimalPlaces,
        isWithinDeadZone ? baseStep : undefined
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
      props.zoomAffectsDragging,
      calculateStep,
      calculateDecimalPlaces,
      setInputIsFocused,
      containerRef,
      setSpeedFactorState,
      zoom
    ]
  );

  const handleMouseUp = useCallback(() => {
    if (dragStateRef.current.isDragging) {
      dragStateRef.current.isDragging = false;
      // sync final value back to react state
      setState((prev) => ({
        ...prev,
        isDragging: false,
        localValue: String(dragStateRef.current.currentDragValue)
      }));

      if (!dragStateRef.current.hasExceededDragThreshold) {
        setInputIsFocused(true);
      }
    }
  }, [setInputIsFocused, dragStateRef, setState]);

  return { handleMouseMove, handleMouseUp };
};
