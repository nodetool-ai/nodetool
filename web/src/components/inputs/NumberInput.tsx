import React, { useState, useEffect, useCallback, memo } from "react";
import { useCombo, useKeyPressedStore } from "../../stores/KeyPressedStore";
import PropertyLabel from "../node/PropertyLabel";
import ThemeNodes from "../themes/ThemeNodes";
import RangeIndicator from "./RangeIndicator";

const DRAG_THRESHOLD = 5;
const PIXELS_PER_STEP = 10;
const SHIFT_PIXELS_PER_STEP = 20;

interface InputProps {
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
}

// Custom Hooks
const useValueCalculation = () => {
  const calculateStep = useCallback(
    (min: number, max: number, inputType: "int" | "float"): number => {
      const range = max - min;
      let baseStep: number;

      if (inputType === "float") {
        if (range <= 1) baseStep = 0.01;
        else if (range <= 20) baseStep = 0.1;
        else if (range > 20 && range <= 100) baseStep = 0.5;
        else baseStep = Math.pow(6, Math.floor(Math.log10(range)) - 2);
      } else {
        if (range <= 1000) baseStep = 1;
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
  setInputIsFocused: (focused: boolean) => void
) => {
  const { controlKeyPressed, shiftKeyPressed } = useKeyPressedStore(
    (state) => ({
      controlKeyPressed: state.isKeyPressed("Control"),
      shiftKeyPressed: state.isKeyPressed("Shift")
    })
  );
  const { calculateStep, calculateDecimalPlaces } = useValueCalculation();

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (state.isDragging && !inputIsFocused) {
        const moveX = e.clientX - state.dragStartX;
        if (Math.abs(moveX) > DRAG_THRESHOLD) {
          setState((prevState) => ({
            ...prevState,
            hasExceededDragThreshold: true
          }));
        }

        let baseStep = calculateStep(
          props.min ?? 0,
          props.max ?? 4096,
          props.inputType || "float"
        );

        // Adjust step based on modifier keys
        if (controlKeyPressed && shiftKeyPressed) {
          baseStep *= 4;
        } else if (controlKeyPressed) {
          if (props.max && props.max > 4096) {
            const min = props.min ?? 0;
            const max = props.max;
            const range = max - min;
            baseStep = range / 25;
          } else {
            baseStep *= 2;
          }
        } else if (shiftKeyPressed) {
          baseStep =
            props.inputType === "float"
              ? props.max && props.max <= 1
                ? 0.01
                : 0.1
              : 1;
        }

        const pixelsPerStep = shiftKeyPressed
          ? SHIFT_PIXELS_PER_STEP
          : PIXELS_PER_STEP;
        const stepIncrement = moveX / pixelsPerStep;
        let newValue = state.dragInitialValue + stepIncrement * baseStep;

        // Round to nearest step
        newValue = Math.round(newValue / baseStep) * baseStep;

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
            currentDragValue: newValue
          }));
          props.onChange(null, newValue);
        }
      }
    },
    [
      state,
      props,
      controlKeyPressed,
      shiftKeyPressed,
      setState,
      calculateStep,
      calculateDecimalPlaces,
      inputIsFocused
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
  }, [state.isDragging, state.hasExceededDragThreshold, setInputIsFocused]);

  return { handleMouseMove, handleMouseUp };
};

// Smaller Components
const EditableInput: React.FC<{
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onFocus: (event: React.FocusEvent<HTMLInputElement>) => void;
  isDefault: boolean;
  isEditable: boolean;
  tabIndex?: number;
  onFocusChange?: (isFocused: boolean) => void;
}> = ({
  value,
  onChange,
  onBlur: onBlurProp,
  onFocus: onFocusProp,
  isDefault,
  tabIndex,
  onFocusChange
}) => {
  const [isFocused, setIsFocused] = useState(false);

  const _onFocus = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocusChange?.(true);
      onFocusProp(event);
    },
    [onFocusProp, onFocusChange]
  );

  const _onBlur = useCallback(() => {
    setIsFocused(false);
    onFocusChange?.(false);
    onBlurProp();
  }, [onBlurProp, onFocusChange]);

  return (
    <input
      type="text"
      className={`edit-value nodrag${isDefault ? " default" : ""}
       edit-value-input`}
      style={{
        width: isFocused ? `${Math.max(value.length * 12, 50)}px` : "0px",
        // position: isFocused ? "inherit" : "absolute",
        color: isFocused ? "inherit" : "transparent",
        backgroundColor: isFocused ? "inherit" : "transparent",
        opacity: isFocused ? 1 : 0.001 // Nearly invisible but still interactive when unfocused
      }}
      value={value}
      onChange={onChange}
      onBlur={_onBlur}
      onFocus={_onFocus}
      tabIndex={tabIndex}
      autoFocus
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.code === "NumpadEnter") {
          e.preventDefault();
          e.stopPropagation();
          _onBlur();
        }
      }}
    />
  );
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
    currentDragValue: props.value ?? 0
  });
  const [inputIsFocused, setInputIsFocused] = useState(false);

  const { handleMouseMove, handleMouseUp } = useDragHandling(
    props,
    state,
    setState,
    inputIsFocused,
    setInputIsFocused
  );

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
    },
    []
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

        setState((prevState) => ({
          ...prevState,
          isDefault: finalValue === props.value,
          localValue: finalValue.toString()
        }));

        props.onChange(null, finalValue);
      } else {
        setState((prevState) => ({
          ...prevState,
          localValue: (props.value ?? 0).toString()
        }));
      }
    },
    [props, state.localValue]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 0) {
        setState((prevState) => ({
          ...prevState,
          dragStartX: e.clientX,
          isDragging: true,
          hasExceededDragThreshold: false,
          dragInitialValue: props.value,
          isFocused: true
        }));
      } else {
        setState((prevState) => ({ ...prevState, isFocused: false }));
      }
    },
    [props.value]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!state.hasExceededDragThreshold) {
        e.preventDefault();
        setState((prevState) => ({
          ...prevState,
          originalValue: Number(prevState.localValue)
        }));
        setInputIsFocused(true);
      }
    },
    [state.hasExceededDragThreshold]
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
      className={`number-input ${props.inputType} ${
        inputIsFocused ? "focused" : ""
      }`}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      style={{
        fontFamily: ThemeNodes.fontFamily1,
        fontSize: ThemeNodes.fontSizeSmall,
        color: ThemeNodes.palette.c_hl1
      }}
    >
      <EditableInput
        value={state.localValue}
        onChange={handleValueChange}
        onBlur={() => handleBlur(true)}
        onFocus={handleInputFocus}
        isDefault={state.isDefault}
        tabIndex={props.tabIndex}
        isEditable={inputIsFocused}
        onFocusChange={setInputIsFocused}
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
