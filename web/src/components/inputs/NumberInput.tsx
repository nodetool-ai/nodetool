/** @jsxImportSource @emotion/react */
import React, { useState, useEffect, useCallback, useRef, memo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import useKeyPressedListener from "../../utils/KeyPressedListener";
import PropertyLabel from "../node/PropertyLabel";
import { TextField } from "@mui/material";
import { css } from "@emotion/react";

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
}

const styles = (theme: any) =>
  css({
    "&, label": {
      cursor: "ew-resize !important"
    },
    ".slider-value": {
      position: "relative",
      fontFamily: theme.font_family1,
      width: "auto",
      top: "-1px",
      left: "0"
    },
    ".slider-value .name": {
      position: "relative",
      textTransform: "uppercase",
      display: "block",
      top: "1px",
      width: "100%",
      maxWidth: "200px",
      minHeight: "15px",
      fontSize: theme.font_size_small,
      wordSpacing: "-0.3em",
      color: theme.c_hl1,
      marginRight: "45px",
      whiteSpace: "normal",
      paddingBottom: "3px",
      lineHeight: "0.86em"
    },
    ".slider-value .value": {
      position: "absolute",
      maxWidth: "80px",
      height: "1em",
      top: "0px",
      right: "0px",
      fontFamily: theme.font_family1,
      fontSize: theme.font_size_smaller,
      lineHeight: "1em",
      backgroundColor: "transparent",
      padding: "0px",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    ".edit-value": {
      position: "absolute",
      width: "auto",
      height: "15px",
      top: "-11px",
      right: "2px",
      zIndex: "10"
    },
    ".edit-value input": {
      position: "absolute",
      width: "auto",
      height: "15px",
      minHeight: "15px",
      top: "0px",
      right: "-7px",
      fontFamily: theme.font_family1,
      fontSize: theme.font_size_smaller,
      margin: "0",
      padding: "0 11px 0 2px",
      textAlign: "right",
      color: theme.palette.c_white,
      backgroundColor: "#3d3f41",
      maxWidth: "100px "
    },
    "edit-value input::selection": {
      backgroundColor: theme.c_hl1
    },
    ".MuiSlider-root .MuiSlider-thumb, .MuiSlider-root .MuiSlider-thumb": {
      opacity: "0"
    },
    "&:hover .MuiSlider-root .MuiSlider-thumb": {
      opacity: "1"
    },
    ".MuiSlider-root .MuiSlider-track": {
      backgroundColor: "transparent",
      transition: "background-color 0.3s 0.3s"
    },
    ".MuiSlider-root:hover .MuiSlider-track, .MuiSlider-root:active .MuiSlider-track, .MuiSlider-root:focus .MuiSlider-track":
      {
        backgroundColor: "#8eaca733",
        transition: "background-color 0.2s 0s"
      },
    ".range-container": {
      transition: "opacity 0.2s",
      position: "absolute",
      bottom: ".4em",
      width: "calc(100% - 20px)",
      height: "2px",
      backgroundColor: theme.palette.c_gray2,
      borderRadius: "2px",
      fontSize: ".5em"
    },
    ".range-indicator": {
      position: "absolute",
      left: "0",
      backgroundColor: theme.palette.c_hl1,
      height: "2px",
      minWidth: "1px"
    }
  });

const NumberInput = memo((props: InputProps) => {
  const id = `slider-${props.name}`;
  const controlKeyPressed = useKeyPressedListener("Control");
  const shiftKeyPressed = useKeyPressedListener("Shift");
  const [isDefault, setIsDefault] = useState(false);
  const [isEditable, setIsEditable] = useState(false);
  const [localValue, setLocalValue] = useState<string>(
    props.value ? props.value.toString() : ""
  );
  const [originalValue, setOriginalValue] = useState<number>(
    props.value !== null ? props.value : 0
  );

  const [dragStartX, setDragStartX] = useState(0);
  const [decimalPlaces, setDecimalPlaces] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const hasExceededDragThreshold = useRef(false);
  const [dragInitialValue, setDragInitialValue] = useState<number>(props.value);
  const currentDragValueRef = useRef(props.value);
  const isFloat = props.inputType === "float";

  const makeEditable = useCallback(() => {
    setIsEditable(true);
    if (isFloat) {
      const formattedValue = parseFloat(localValue).toFixed(1);
      setLocalValue(formattedValue);
    }
  }, [isFloat, localValue]);

  useHotkeys("Escape", () => {
    if (originalValue !== null) {
      setLocalValue(originalValue.toString());
    }
    handleBlur(false);
  });

  useEffect(() => {
    if (props.value) {
      if (!isEditable) {
        setLocalValue(props.value.toString());
      }
    }
  }, [props.value, isEditable]);

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    const normalizedInput = input.replace(/,/g, ".");
    const regex = isFloat ? /[^0-9.-]/g : /[^0-9-]/g;
    const cleanedInput = normalizedInput.replace(regex, "");
    setLocalValue(cleanedInput);
  };

  const handleInputFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    event.target.select();
  };

  const handleBlur = (shouldSave: boolean) => {
    let finalValue: number;

    if (shouldSave) {
      if (isFloat) {
        finalValue = parseFloat(localValue);
      } else {
        finalValue = Math.round(Number(localValue));
      }

      if (isNaN(finalValue)) {
        finalValue = props.min ?? 0;
      }
      if (props.min !== undefined && finalValue < props.min) {
        finalValue = props.min;
      }
      if (props.max !== undefined && finalValue > props.max) {
        finalValue = props.max;
      }
      if (finalValue === props.value) {
        setIsDefault(true);
      } else {
        setIsDefault(false);
      }

      props.onChange(null, finalValue);
    }

    setLocalValue(props.value.toString());
    setIsEditable(false);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 0) {
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      hasExceededDragThreshold.current = false;
      setDragInitialValue(props.value);
      setDragStartX(e.clientX);
      setIsDragging(true);
    } else {
      setIsEditable(false);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!hasExceededDragThreshold.current) {
      e.preventDefault();
      setOriginalValue(Number(localValue));
      makeEditable();
    }
  };

  function calculateStep(
    min: number,
    max: number,
    inputType: "int" | "float"
  ): number {
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
      else baseStep = Math.pow(6, Math.floor(Math.log10(range)) - 1);
    }

    return baseStep;
  }

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging) {
        const moveX = e.clientX - dragStartX;
        const range = (props.max || 4096) - (props.min || 0);
        if (Math.abs(moveX) > 5) {
          hasExceededDragThreshold.current = true;
        }
        let baseStep = calculateStep(
          props.min ?? 0,
          props.max ?? 4096,
          props.inputType || "float"
        );
        if (controlKeyPressed && shiftKeyPressed) {
          baseStep = baseStep * 4;
        } else if (controlKeyPressed) {
          baseStep = baseStep * 2;
        } else if (shiftKeyPressed) {
          if (isFloat) {
            if (range <= 1) {
              baseStep = 0.01;
            } else {
              baseStep = 0.1;
            }
          } else {
            baseStep = 1;
          }
        }
        const pixelsPerStep = shiftKeyPressed ? 20 : 10;
        const stepIncrement = moveX / pixelsPerStep;
        const preliminaryNewValue = dragInitialValue + stepIncrement * baseStep;
        const remainder = preliminaryNewValue % baseStep;
        let newValue;
        if (remainder !== 0) {
          if (remainder >= baseStep / 2) {
            newValue = preliminaryNewValue + (baseStep - remainder);
          } else {
            newValue = preliminaryNewValue - remainder;
          }
        } else {
          newValue = preliminaryNewValue;
        }

        if (props.inputType === "float") {
          setDecimalPlaces(Math.ceil(Math.log10(1 / baseStep)));
          newValue = parseFloat(newValue.toFixed(decimalPlaces));
        }

        newValue = Math.max(
          props.min ?? 0,
          Math.min(props.max ?? 4096, newValue)
        );

        if (newValue !== currentDragValueRef.current) {
          setLocalValue(newValue.toString());
          props.onChange(null, newValue);
          currentDragValueRef.current = newValue;
        }
      }
    },
    [
      isDragging,
      dragStartX,
      dragInitialValue,
      controlKeyPressed,
      shiftKeyPressed,
      isFloat,
      setDecimalPlaces,
      decimalPlaces,
      props
    ]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      if (!hasExceededDragThreshold.current) {
        // only toggle editable state if the drag threshold was not exceeded
        setOriginalValue(Number(localValue));
        makeEditable();
      }
    }
  }, [isDragging, localValue, makeEditable]);

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return (
    <div
      className={`number-input ${props.inputType}`}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      css={styles}
    >
      {isEditable ? (
        <TextField
          type="text"
          className={`edit-value nodrag${isDefault ? " default" : ""}`}
          inputProps={{
            className: "edit-value-input",
            style: { width: Math.max(localValue?.length * 9, 12) }
          }}
          variant="standard"
          value={localValue}
          onChange={handleValueChange}
          onBlur={() => handleBlur(true)}
          onFocus={handleInputFocus}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.code === "NumpadEnter") {
              e.preventDefault();
              e.stopPropagation();
              handleBlur(true);
            }
          }}
        />
      ) : (
        <></>
      )}
      <div id={id} className="slider-value nodrag">
        {props.hideLabel ? null : (
          <PropertyLabel
            name={props.name}
            description={props.description}
            id={id}
          />
        )}
        {!isEditable && (
          <div className="value">
            {typeof props.value === "number"
              ? props.inputType === "float"
                ? props.value.toFixed(decimalPlaces)
                : props.value
              : "NaN"}
          </div>
        )}
      </div>

      <div
        className="range-container"
        style={{ opacity: isDragging || isEditable ? 1 : 0 }}
      >
        <div
          className="range-indicator"
          style={{
            width: `${
              ((props.value - (props.min || 0)) /
                ((props.max || 4096) - (props.min || 0))) *
              100
            }%`
          }}
        ></div>
      </div>
    </div>
  );
});
NumberInput.displayName = "NumberInput";
export default NumberInput;
