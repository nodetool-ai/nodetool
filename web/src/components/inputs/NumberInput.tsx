import React, { useState, useEffect, useCallback, memo, useRef } from "react";
import { useCombo, useKeyPressedStore } from "../../stores/KeyPressedStore";
import PropertyLabel from "../node/PropertyLabel";
import { useTheme } from "@mui/material/styles";
import RangeIndicator from "./RangeIndicator";
import EditableInput from "./EditableInput";
import { useFocusPan } from "../../hooks/useFocusPan";

// Drag-tuning constants
const DRAG_THRESHOLD = 10; // px before drag counts
const PIXELS_PER_STEP = 10; // horizontal px per base-step
const DRAG_SLOWDOWN_DEAD_ZONE_PX = 10; // no-slow band above/below slider
const DRAG_SLOWDOWN_RAMP_BASE_PX = 50; // ramp half-height in px
const DRAG_SLOWDOWN_RAMP_PX = DRAG_SLOWDOWN_RAMP_BASE_PX * 2; // full ramp span
const MIN_SPEED_FACTOR = 0.1; // min speed (normal)
const SHIFT_MIN_SPEED_FACTOR = 0.01; // min speed with Shift
const SHIFT_SLOWDOWN_DIVIDER = 5; // Shift divides speed by this

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
  containerRef: React.RefObject<HTMLDivElement>,
  dragStateRef: React.MutableRefObject<NumberInputState>,
  setSpeedFactorState: React.Dispatch<React.SetStateAction<number>>
) => {
  const { shiftKeyPressed } = useKeyPressedStore((state) => ({
    shiftKeyPressed: state.isKeyPressed("Shift")
  }));
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

      const t = Math.min(distanceOutside / DRAG_SLOWDOWN_RAMP_PX, 1);
      let speedFactor = 1 - t * t;
      speedFactor = Math.max(speedFactor, MIN_SPEED_FACTOR);
      if (e.shiftKey) {
        speedFactor = Math.max(
          speedFactor / SHIFT_SLOWDOWN_DIVIDER,
          SHIFT_MIN_SPEED_FACTOR
        );
      }

      // expose to overlay/debug
      setSpeedFactorState(speedFactor);

      //---------------------------------------------------------------------

      const baseStep = calculateStep(
        props.min ?? 0,
        props.max ?? 4096,
        props.inputType || "float"
      );

      let newValue: number;

      if (isOverSlider && !e.shiftKey) {
        // Direct slider mapping: left => min, right => max
        const ratio = (e.clientX - rect.left) / rect.width;
        newValue =
          (props.min ?? 0) +
          Math.max(0, Math.min(1, ratio)) *
            ((props.max ?? 4096) - (props.min ?? 0));
      } else {
        // Incremental dragging logic
        const deltaX = e.clientX - lastClientX;

        const effectivePixelsPerStep = PIXELS_PER_STEP / speedFactor;

        if (Math.abs(deltaX) < 0.5) {
          newValue = currentDragValue;
        } else {
          const stepIncrement = deltaX / effectivePixelsPerStep;
          newValue = currentDragValue + stepIncrement * baseStep;
        }
      }

      if (props.inputType === "float") {
        const newDecimalPlaces = calculateDecimalPlaces(baseStep);
        if (newDecimalPlaces !== decimalPlaces) {
          dragStateRef.current.decimalPlaces = newDecimalPlaces;
        }
        newValue = parseFloat(newValue.toFixed(newDecimalPlaces));
      } else {
        newValue = Math.round(newValue);
      }

      newValue = Math.max(
        props.min ?? 0,
        Math.min(props.max ?? 4096, newValue)
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
  }, [setInputIsFocused]);

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
  const theme = useTheme();
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
  const [speedFactorState, setSpeedFactorState] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef(state);
  dragStateRef.current = state;

  const { handleMouseMove, handleMouseUp } = useDragHandling(
    props,
    state,
    setState,
    inputIsFocused,
    setInputIsFocused,
    containerRef,
    dragStateRef,
    setSpeedFactorState
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
          currentDragValue: props.value,
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
    // Sync with external value changes, but only when not dragging or focused.
    if (!inputIsFocused && !state.isDragging) {
      const newValueStr = (props.value ?? 0).toString();
      setState((prevState) => {
        // Only update if the string representation has actually changed to prevent
        // an infinite re-render loop that eventually triggers the React "Maximum
        // update depth exceeded" warning.
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
        fontFamily: theme.fontFamily1,
        fontSize: theme.fontSizeSmall,
        color: theme.palette.primary.main,
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
      <RangeIndicator
        value={props.value}
        min={props.min || 0}
        max={props.max || 4096}
        isDragging={state.isDragging}
        isEditable={inputIsFocused}
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
    prevProps.hideLabel === nextProps.hideLabel
  );
});
