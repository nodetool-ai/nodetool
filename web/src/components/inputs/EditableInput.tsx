import React, { useState, useCallback, useRef, useEffect } from "react";

interface EditableInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onFocus: (event: React.FocusEvent<HTMLInputElement>) => void;
  isDefault: boolean;
  tabIndex?: number;
  onFocusChange?: (isFocused: boolean) => void;
  shouldFocus?: boolean;
}

const EditableInput: React.FC<EditableInputProps> = ({
  value,
  onChange,
  onBlur: onBlurProp,
  onFocus: onFocusProp,
  isDefault,
  tabIndex,
  onFocusChange,
  shouldFocus = false
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (!shouldFocus) {
      setIsFocused(false);
    }
  }, [shouldFocus]);

  useEffect(() => {
    // Skip the first render to prevent auto-focus on mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (onFocusChange && shouldFocus) {
      setIsFocused(true);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  }, [onFocusChange, shouldFocus]);

  useEffect(() => {
    // Only focus if explicitly requested and not on initial mount
    if (
      !isInitialMount.current &&
      shouldFocus &&
      !isFocused &&
      inputRef.current
    ) {
      inputRef.current.focus();
    }
  }, [shouldFocus, isFocused]);

  const _onFocus = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocusChange?.(true);
      onFocusProp(event);
      // Prevent scrolling to the input
      if (inputRef.current) {
        inputRef.current.scrollIntoView = () => {};
      }
      // event.preventDefault();
    },
    [onFocusProp, onFocusChange]
  );

  const _onBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const numberInputContainer = e.currentTarget.closest(".number-input");
      if (!numberInputContainer?.contains(e.relatedTarget as Node)) {
        setIsFocused(false);
        onFocusChange?.(false);
        onBlurProp();
      }
    },
    [onBlurProp, onFocusChange]
  );

  useEffect(() => {
    if (!isInitialMount.current && inputRef.current && isFocused) {
      inputRef.current.focus();
      // Prevent scrolling to the input
      inputRef.current.scrollIntoView = () => {};
    }
  }, [isFocused]);

  return (
    <div className="editable-input-container">
      <input
        ref={inputRef}
        type="text"
        className={`edit-value nodrag${
          isDefault ? " default" : ""
        } edit-value-input`}
        style={{
          position: "absolute",
          width: isFocused ? `${Math.max(value.length * 12, 50)}px` : "0px",
          color: isFocused ? "inherit" : "transparent",
          backgroundColor: isFocused ? "inherit" : "transparent",
          opacity: isFocused ? 1 : 0.001,
          pointerEvents: isFocused ? "auto" : "none",
          zIndex: isFocused ? 1 : "auto"
        }}
        value={value}
        onChange={onChange}
        onBlur={_onBlur}
        onFocus={_onFocus}
        tabIndex={tabIndex}
        autoFocus={false}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.code === "NumpadEnter") {
            e.preventDefault();
            e.stopPropagation();
            _onBlur(e as unknown as React.FocusEvent<HTMLInputElement>);
          }
        }}
      />
    </div>
  );
};

export default EditableInput;
