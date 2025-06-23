import React, { useState, useEffect, useCallback, memo, useRef } from "react";
import { useCombo, useKeyPressedStore } from "../../stores/KeyPressedStore";
import PropertyLabel from "../node/PropertyLabel";
import ThemeNodes from "../themes/ThemeNodes";
import RangeIndicator from "./RangeIndicator";
import EditableInput from "./EditableInput";
import { useFocusPan } from "../../hooks/useFocusPan";

const DRAG_THRESHOLD = 5;
const PIXELS_PER_STEP = 10;
const SHIFT_PIXELS_PER_STEP = 20;
const DRAG_BOUNDS_EM = 1; // vertical zone above/below slider with no slowdown
const EXP_SLOWDOWN_DIVISOR = 50; //10× slowdown
const VISUAL_SLOWDOWN_DISTANCE_PX = EXP_SLOWDOWN_DIVISOR * 3;
const MIN_SPEED_FACTOR = 0.01; // 1% speed at extremes

interface InputProps {
  nodeId: string;
  name: string;
  description?: string | null;
  min?: number;
  max?: number;
  value: number;
  onChange: (event: any, value: number) => void;
  id: string;
  size?: "small" | "medium";
  color?: "primary" | "secondary";
  className?: string;
  inputType?: "int" | "float";
  hideLabel?: boolean;
  tabIndex?: number;
}

interface NumberInputState {
  isDefault: boolean;
  localValue: string;
  originalValue: number;
  dragStartX: number;
  decimalPlaces: number;
  isDragging: boolean;
  hasExceededDragThreshold: boolean;
  dragInitialValue: number;
  currentDragValue: number;
  lastClientX: number;
  dragPointerY: number | null;
}

// Custom Hooks
const useValueCalculation = () => {
  const calculateStep = useCallback(
    (min: number, max: number, inputType: "int" | "float"): number => {
      const range = max - min;
      let baseStep: number;

      if (inputType === "float") {
        if (range <= 1) baseStep = 0.01;
        else if (range <= 20) baseStep = 0.5;
        else if (range > 20 && range <= 100) baseStep = 0.5;
        else baseStep = Math.pow(6, Math.floor(Math.log10(range)) - 2);
      } else {
        if (range <= 20) baseStep = 0.1;
        else if (range <= 1000) baseStep = 1;
        else if (range > 1000 && range <= 5000) baseStep = 16;
        else if (range > 5000 && range <= 10000) baseStep = 32;
        else if (range > 10000) baseStep = 64;
        else baseStep = Math.pow(6, Math.floor(Math.log10(range)) - 1);
      }

      return baseStep;
    },
    []
  );

  const calculateDecimalPlaces = useCallback((baseStep: number) => {
    return Math.max(0, Math.ceil(Math.log10(1 / baseStep)));
  }, []);

  return { calculateStep, calculateDecimalPlaces };
};

const useDragHandling = (
  props: InputProps,
  state: NumberInputState,
  setState: React.Dispatch<React.SetStateAction<NumberInputState>>,
  inputIsFocused: boolean,
  setInputIsFocused: (focused: boolean) => void,
  containerRef: React.RefObject<HTMLDivElement>
) => {
  const { shiftKeyPressed } = useKeyPressedStore((state) => ({
    shiftKeyPressed: state.isKeyPressed("Shift")
  }));
  const { calculateStep, calculateDecimalPlaces } = useValueCalculation();

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (state.isDragging) {
        const moveX = e.clientX - state.dragStartX;
        if (Math.abs(moveX) > DRAG_THRESHOLD) {
          setState((prevState) => ({
            ...prevState,
            hasExceededDragThreshold: true
          }));
          setInputIsFocused(false);
        }

        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();

        // Calculate drag bounds area (slider ± 2em vertically)
        const fontSizePx = parseFloat(
          window.getComputedStyle(containerRef.current).fontSize || "16"
        );
        const dragBoundsPx = DRAG_BOUNDS_EM * fontSizePx;

        const isOverSlider = e.clientY >= rect.top && e.clientY <= rect.bottom;
        const isWithinDragBounds =
          e.clientY >= rect.top - dragBoundsPx &&
          e.clientY <= rect.bottom + dragBoundsPx;

        const baseStep = calculateStep(
          props.min ?? 0,
          props.max ?? 4096,
          props.inputType || "float"
        );

        let newValue: number;

        if (isOverSlider) {
          // Direct slider mapping: left => min, right => max
          const ratio = (e.clientX - rect.left) / rect.width;
          newValue =
            (props.min ?? 0) +
            Math.max(0, Math.min(1, ratio)) *
              ((props.max ?? 4096) - (props.min ?? 0));
        } else {
          // Incremental dragging based on percentage of slider width

          // Distance outside slider (positive when pointer is above or below slider)
          const distanceOutside = !isWithinDragBounds
            ? Math.max(
                0,
                e.clientY < rect.top - dragBoundsPx
                  ? rect.top - dragBoundsPx - e.clientY
                  : e.clientY - (rect.bottom + dragBoundsPx)
              )
            : 0;

          // Speed factor: 1 at slider edge, quadratic drop to MIN_SPEED_FACTOR at max visual distance
          const t = Math.min(distanceOutside / VISUAL_SLOWDOWN_DISTANCE_PX, 1);
          let speedFactor = 1 - t * t; // gentler curve: slows down later
          speedFactor = Math.max(speedFactor, MIN_SPEED_FACTOR);

          if (shiftKeyPressed) {
            speedFactor *= 0.1; // shift further slows to 10%
          }

          // Convert horizontal movement to value change using baseStep units
          const deltaX = e.clientX - state.lastClientX;

          const effectivePixelsPerStep =
            (shiftKeyPressed ? SHIFT_PIXELS_PER_STEP : PIXELS_PER_STEP) /
            speedFactor;

          if (Math.abs(deltaX) < 0.5) {
            newValue = state.currentDragValue;
          } else {
            const stepIncrement = deltaX / effectivePixelsPerStep;
            newValue = state.currentDragValue + stepIncrement * baseStep;
          }
        }

        if (props.inputType === "float") {
          const newDecimalPlaces = calculateDecimalPlaces(baseStep);
          if (newDecimalPlaces !== state.decimalPlaces) {
            setState((prevState) => ({
              ...prevState,
              decimalPlaces: newDecimalPlaces
            }));
          }
          newValue = parseFloat(newValue.toFixed(newDecimalPlaces));
        } else {
          newValue = Math.round(newValue);
        }

        newValue = Math.max(
          props.min ?? 0,
          Math.min(props.max ?? 4096, newValue)
        );

        if (newValue !== state.currentDragValue) {
          setState((prevState) => ({
            ...prevState,
            currentDragValue: newValue,
            lastClientX: e.clientX,
            dragPointerY: e.clientY
          }));
          props.onChange(null, newValue);
        } else {
          // still update lastClientX to keep relative tracking
          setState((prevState) => ({
            ...prevState,
            lastClientX: e.clientX,
            dragPointerY: e.clientY
          }));
        }
      }
    },
    [
      state.isDragging,
      state.dragStartX,
      state.dragInitialValue,
      state.currentDragValue,
      state.decimalPlaces,
      calculateStep,
      props,
      shiftKeyPressed,
      setState,
      setInputIsFocused,
      calculateDecimalPlaces,
      containerRef
    ]
  );

  const handleMouseUp = useCallback(() => {
    if (state.isDragging) {
      setState((prevState) => ({
        ...prevState,
        isDragging: false
      }));
      if (!state.hasExceededDragThreshold) {
        setInputIsFocused(true);
      }
    }
  }, [
    state.isDragging,
    state.hasExceededDragThreshold,
    setState,
    setInputIsFocused
  ]);

  return { handleMouseMove, handleMouseUp };
};

const DisplayValue: React.FC<{
  value: number;
  isFloat: boolean;
  decimalPlaces: number;
}> = ({ value, isFloat, decimalPlaces }) => (
  <div className="value">
    {typeof value === "number"
      ? isFloat
        ? value.toFixed(decimalPlaces)
        : value
      : "NaN"}
  </div>
);

const NumberInput: React.FC<InputProps> = (props) => {
  const [state, setState] = useState<NumberInputState>({
    isDefault: false,
    localValue: props.value?.toString() ?? "",
    originalValue: props.value ?? 0,
    dragStartX: 0,
    decimalPlaces: 1,
    isDragging: false,
    hasExceededDragThreshold: false,
    dragInitialValue: props.value ?? 0,
    currentDragValue: props.value ?? 0,
    lastClientX: 0,
    dragPointerY: null
  });
  const [inputIsFocused, setInputIsFocused] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const { handleMouseMove, handleMouseUp } = useDragHandling(
    props,
    state,
    setState,
    inputIsFocused,
    setInputIsFocused,
    containerRef
  );

  const handleFocusPan = useFocusPan(props.nodeId);

  useCombo(
    ["Escape"],
    useCallback(() => {
      setState((prevState) => ({
        ...prevState,
        localValue: (props.value ?? 0).toString()
      }));
      setInputIsFocused(false);
    }, [props.value])
  );

  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value;
      const normalizedInput = input.replace(/,/g, ".");
      const regex = props.inputType === "float" ? /[^0-9.-]/g : /[^0-9-]/g;
      const cleanedInput = normalizedInput.replace(regex, "");
      setState((prevState) => ({ ...prevState, localValue: cleanedInput }));
    },
    [props.inputType]
  );

  const handleInputFocus = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      event.target.select();
      setState((prevState) => ({ ...prevState, isFocused: true }));
      handleFocusPan(event);
    },
    [handleFocusPan]
  );

  const handleBlur = useCallback(
    (shouldSave: boolean) => {
      let finalValue: number;
      if (shouldSave) {
        if (props.inputType === "float") {
          finalValue = parseFloat(state.localValue);
        } else {
          finalValue = Math.round(Number(state.localValue));
        }

        if (isNaN(finalValue)) {
          finalValue = props.min ?? 0;
        }
        finalValue = Math.max(
          props.min ?? 0,
          Math.min(props.max ?? 4096, finalValue)
        );
        setInputIsFocused(false);
        setState((prevState) => ({
          ...prevState,
          inputIsFocused: false,
          isDefault: finalValue === props.value,
          localValue: finalValue.toString()
        }));

        props.onChange(null, finalValue);
      } else {
        setState((prevState) => ({
          ...prevState,
          inputIsFocused: false,
          localValue: (props.value ?? 0).toString()
        }));
      }
    },
    [props, state.localValue]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 0) {
        setInputIsFocused(false);
        setState((prevState) => ({
          ...prevState,
          dragStartX: e.clientX,
          isDragging: true,
          hasExceededDragThreshold: false,
          dragInitialValue: props.value,
          lastClientX: e.clientX,
          dragPointerY: e.clientY
        }));
      }
    },
    [props.value]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (state.hasExceededDragThreshold) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setInputIsFocused(true);
      setState((prevState) => ({
        ...prevState,
        originalValue: Number(prevState.localValue),
        isDragging: false
      }));
    },
    [state.hasExceededDragThreshold]
  );

  const handleContainerBlur = useCallback((e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setInputIsFocused(false);
      setState((prevState) => ({
        ...prevState,
        isDragging: false
      }));
    }
  }, []);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      handleBlur(true);
      setInputIsFocused(false);
    },
    [handleBlur]
  );

  useEffect(() => {
    if (!inputIsFocused) {
      setState((prevState) => ({
        ...prevState,
        localValue: (props.value ?? 0).toString()
      }));
    }
  }, [props.value, inputIsFocused]);

  useEffect(() => {
    if (state.isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [state.isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={containerRef}
      className={`number-input ${props.inputType} ${
        inputIsFocused ? "focused" : ""
      }`}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onBlur={handleContainerBlur}
      onContextMenu={handleContextMenu}
      tabIndex={-1}
      style={{
        fontFamily: ThemeNodes.fontFamily1,
        fontSize: ThemeNodes.fontSizeSmall,
        color: ThemeNodes.palette.c_hl1,
        position: "relative"
      }}
    >
      <EditableInput
        value={state.localValue}
        onChange={handleValueChange}
        onBlur={() => handleBlur(true)}
        onFocus={handleInputFocus}
        isDefault={state.isDefault}
        tabIndex={props.tabIndex}
        onFocusChange={setInputIsFocused}
        shouldFocus={inputIsFocused}
      />
      <div id={props.id} className="slider-value nodrag" tabIndex={-1}>
        {props.hideLabel ? null : (
          <PropertyLabel
            name={props.name}
            description={props.description}
            id={props.id}
          />
        )}
        {!inputIsFocused && (
          <DisplayValue
            value={props.value}
            isFloat={props.inputType === "float"}
            decimalPlaces={state.decimalPlaces}
          />
        )}
      </div>
      <RangeIndicator
        value={props.value}
        min={props.min || 0}
        max={props.max || 4096}
        isDragging={state.isDragging}
        isEditable={inputIsFocused}
      />

      {/* Slowdown visualization overlay (absolute, narrow) */}
      {state.isDragging && (
        <>
          <div
            key="overlay-up"
            style={{
              position: "absolute" as const,
              right: "-10px",
              top: `-${VISUAL_SLOWDOWN_DISTANCE_PX - 5}px`,
              width: "8px",
              height: `${VISUAL_SLOWDOWN_DISTANCE_PX}px`,
              background:
                "linear-gradient(to bottom, rgba(150,150,150,0.15) 0%, rgba(0,123,255,0) 100%)",
              pointerEvents: "none" as const,
              zIndex: 10,
              borderBottom: "1px dashed var(--c_hl1)"
            }}
          />
          <div
            key="overlay-down"
            style={{
              position: "absolute" as const,
              right: "-10px",
              bottom: `-${VISUAL_SLOWDOWN_DISTANCE_PX}px`,
              width: "8px",
              height: `${VISUAL_SLOWDOWN_DISTANCE_PX - 5}px`,
              background:
                "linear-gradient(to top, rgba(150,150,150,0.15) 0%, rgba(0,123,255,0) 100%)",
              pointerEvents: "none" as const,
              zIndex: 10,
              borderTop: "1px dashed var(--c_hl1)"
            }}
          />
        </>
      )}
    </div>
  );
};

export default memo(NumberInput, (prevProps, nextProps) => {
  return (
    prevProps.value === nextProps.value &&
    prevProps.min === nextProps.min &&
    prevProps.max === nextProps.max &&
    prevProps.inputType === nextProps.inputType &&
    prevProps.hideLabel === nextProps.hideLabel
  );
});
