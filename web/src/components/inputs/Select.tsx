import { isEqual } from "lodash";
import React, {
  useCallback,
  useMemo,
  useRef,
  useEffect,
  memo,
  useId
} from "react";
import useSelect from "../../hooks/nodes/useSelect";

interface Option {
  value: any;
  label: string;
}

interface SelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder
}) => {
  const selectRef = useRef<HTMLDivElement>(null);
  const { open, close, activeSelect } = useSelect();
  const id = useId();

  const toggleDropdown = useCallback(() => {
    activeSelect === id ? close() : open(id);
  }, [close, activeSelect, id, open]);

  const handleOptionClick = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      close();
    },
    [onChange, close]
  );

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (
        selectRef.current &&
        !selectRef.current.contains(event.target as Node)
      ) {
        close();
      }
    },
    [close]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [handleClickOutside]);

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );

  return (
    <div
      ref={selectRef}
      className={`custom-select ${activeSelect === id ? "open" : ""}`}
    >
      <div className="select-header" onClick={toggleDropdown}>
        <span className="select-header-text">
          {selectedOption
            ? selectedOption.label
            : placeholder || "Select an option"}
        </span>
        <span className="arrow" />
      </div>
      {activeSelect === id && (
        <ul className="options-list">
          {options.map((option) => (
            <li
              key={option.value}
              className={`option ${option.value === value ? "selected" : ""}`}
              onClick={() => handleOptionClick(option.value)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default memo(Select, isEqual);
