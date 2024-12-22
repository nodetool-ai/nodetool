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
  shouldFocus
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (onFocusChange) {
      setIsFocused(true);
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  }, [onFocusChange]);

  useEffect(() => {
    if (shouldFocus && !isFocused && inputRef.current) {
      inputRef.current.focus();
    }
  }, [shouldFocus, isFocused]);

  const _onFocus = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocusChange?.(true);
      onFocusProp(event);
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
    if (inputRef.current && isFocused) {
      inputRef.current.focus();
    }
  }, [isFocused]);

  return (
    <input
      ref={inputRef}
      type="text"
      className={`edit-value nodrag${
        isDefault ? " default" : ""
      } edit-value-input`}
      style={{
        width: isFocused ? `${Math.max(value.length * 12, 50)}px` : "0px",
        color: isFocused ? "inherit" : "transparent",
        backgroundColor: isFocused ? "inherit" : "transparent",
        opacity: isFocused ? 1 : 0.001,
        pointerEvents: isFocused ? "auto" : "none"
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
          _onBlur(e as unknown as React.FocusEvent<HTMLInputElement>);
        }
      }}
    />
  );
};

export default EditableInput;
