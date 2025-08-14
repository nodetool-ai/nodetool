import React, { useState, useEffect, useCallback, memo, useRef } from "react";
import { useCombo } from "../../stores/KeyPressedStore";
import PropertyLabel from "../node/PropertyLabel";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import RangeIndicator from "./RangeIndicator";
import EditableInput from "./EditableInput";
import { useFocusPan } from "../../hooks/useFocusPan";
import { useViewport } from "@xyflow/react";
import { getMousePosition } from "../../utils/MousePosition";
import { useDragHandling } from "../../hooks/useNumberInput";
import DisplayValue from "./DisplayValue";
import SpeedDisplay from "./SpeedDisplay";

// Drag-tuning constants
export const DRAG_THRESHOLD = 10; // px before drag counts (to prevent accidental dragging when clicking to set value)
export const DRAG_SLOWDOWN_DEAD_ZONE_PX = 10; // no-slow band above/below slider (slider should feel responsive when dragging normally)
export const DRAG_SLOWDOWN_RAMP_PX = 300; // range in px for slow-down

// Minimum horizontal speed factors
export const MIN_SPEED_FACTOR = 0.01; // min speed
export const SHIFT_MIN_SPEED_FACTOR = 0.001; // min speed with Shift
export const SHIFT_SLOWDOWN_DIVIDER = 10; // Shift divides speed by this

export interface InputProps {
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
  zoomAffectsDragging?: boolean;
  showSlider?: boolean;
}

export interface NumberInputState {
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
  actualSliderWidth: number;
}

const NumberInput: React.FC<InputProps> = (props) => {
  const theme = useTheme();
  const hasBounds =
    typeof props.min === "number" && typeof props.max === "number";
  const sliderVisible = (props.showSlider ?? hasBounds) && hasBounds;
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
    actualSliderWidth: 180
  });
  const [inputIsFocused, setInputIsFocused] = useState(false);
  const [speedFactorState, setSpeedFactorState] = useState(1);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef(state);
  dragStateRef.current = state;

  const { zoom } = useViewport();

  const { handleMouseMove, handleMouseUp } = useDragHandling(
    props,
    state,
    setState,
    inputIsFocused,
    setInputIsFocused,
    containerRef,
    dragStateRef,
    setSpeedFactorState,
    zoom
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
          finalValue =
            props.value ?? state.originalValue ?? props.min ?? props.max ?? 0;
        }
        if (typeof props.min === "number") {
          finalValue = Math.max(props.min, finalValue);
        }
        if (typeof props.max === "number") {
          finalValue = Math.min(props.max, finalValue);
        }
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
    [props, state.localValue, state.originalValue]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 0) {
        setInputIsFocused(false);
        // Set initial mouse position for the display
        setMousePosition({ x: e.clientX, y: e.clientY });

        // Reset speed factor to default (no slowdown)
        setSpeedFactorState(1);

        // Capture actual slider width at drag start
        const sliderWidth = containerRef.current?.offsetWidth || 180;

        setState((prevState) => ({
          ...prevState,
          dragStartX: e.clientX,
          isDragging: true,
          hasExceededDragThreshold: false,
          dragInitialValue: props.value,
          currentDragValue: props.value,
          lastClientX: e.clientX,
          actualSliderWidth: sliderWidth
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
    // Sync with external value changes, but only when not dragging or focused.
    if (!inputIsFocused && !state.isDragging) {
      const newValueStr = (props.value ?? 0).toString();
      setState((prevState) => {
        // Only update if the string representation changed to prevent
        // an infinite re-render loop.
        if (prevState.localValue === newValueStr) {
          return prevState;
        }
        return {
          ...prevState,
          localValue: newValueStr
        };
      });
    }
  }, [props.value, inputIsFocused, state.isDragging]);

  useEffect(() => {
    if (!state.isDragging) return;

    // Capture the current handler references once. Using local constants keeps the
    // effect dependency array minimal and prevents re-running this effect on every
    // render while dragging (which previously caused listener churn and could
    // contribute to deep update loops).
    const moveHandler = handleMouseMove;
    const upHandler = handleMouseUp;

    document.addEventListener("mousemove", moveHandler);
    document.addEventListener("mouseup", upHandler);

    return () => {
      document.removeEventListener("mousemove", moveHandler);
      document.removeEventListener("mouseup", upHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isDragging]);

  // Track mouse position during drag
  useEffect(() => {
    if (state.isDragging) {
      const updateMousePos = () => {
        const pos = getMousePosition();
        setMousePosition(pos);
      };
      updateMousePos();
      const interval = setInterval(updateMousePos, 16); // ~60fps
      return () => clearInterval(interval);
    }
  }, [state.isDragging]);

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
            showTooltip={!state.isDragging}
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
      {sliderVisible &&
        typeof props.min === "number" &&
        typeof props.max === "number" && (
          <RangeIndicator
            value={props.value}
            min={props.min}
            max={props.max}
            isDragging={state.isDragging}
            isEditable={inputIsFocused}
          />
        )}
      <SpeedDisplay
        speedFactor={speedFactorState}
        mousePosition={mousePosition}
        isDragging={state.isDragging}
      />
    </div>
  );
};

export default memo(NumberInput, (prevProps, nextProps) => {
  return (
    prevProps.value === nextProps.value &&
    prevProps.min === nextProps.min &&
    prevProps.max === nextProps.max &&
    prevProps.inputType === nextProps.inputType &&
    prevProps.hideLabel === nextProps.hideLabel &&
    prevProps.showSlider === nextProps.showSlider
  );
});
