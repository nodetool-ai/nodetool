/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
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
  label: string | React.ReactNode;
  tabIndex?: number;
}

interface SelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  tabIndex?: number;
}

const ChevronIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M6 9L12 15L18 9"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const menuStyles = (theme: any) =>
  css({
    ".options-list": {
      position: "absolute",
      width: "auto",
      minWidth: "100%",
      maxWidth: "300px",
      maxHeight: "300px",
      overflowY: "auto",
      margin: 0,
      padding: ".5em 0",
      listStyle: "none",
      backgroundColor: theme.palette.c_gray1,
      border: `1px solid ${theme.palette.c_gray3}`,
      borderRadius: ".3em",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
      zIndex: 1000,
      whiteSpace: "nowrap"
    },

    ".option": {
      padding: ".5em 1em",
      cursor: "pointer",
      fontSize: theme.fontSizeNormal,
      color: theme.palette.c_gray6,
      transition: "all 0.2s ease",
      whiteSpace: "nowrap",

      "&:hover": {
        backgroundColor: theme.palette.c_gray2,
        color: theme.palette.c_white
      },

      "&.selected": {
        backgroundColor: theme.palette.c_gray2,
        color: theme.palette.c_hl1
      }
    },

    ".select-header": {
      padding: "0px 5px",
      margin: "5px 0",
      backgroundColor: theme.palette.c_gray2,
      border: `1px solid ${theme.palette.c_gray2}`,
      fontSize: theme.fontSizeSmaller,
      borderRadius: ".3em",
      cursor: "pointer",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",

      "&:hover": {
        borderColor: theme.palette.c_gray4
      }
    },

    ".select-header-text": {
      color: theme.palette.c_white,
      fontSize: theme.fontSizeNormal
    },

    ".chevron": {
      transition: "transform 0.2s ease",
      color: theme.palette.c_gray4,
      transform: "rotate(0deg)",

      "&.open": {
        transform: "rotate(180deg)"
      }
    }
  });

const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  tabIndex
}) => {
  const selectRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLUListElement>(null);
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

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );

  const updateDropdownPosition = useCallback(() => {
    if (!selectRef.current || !optionsRef.current || activeSelect !== id)
      return;

    const selectRect = selectRef.current.getBoundingClientRect();
    const optionsHeight = optionsRef.current.offsetHeight;
    const windowHeight = window.innerHeight;
    const spaceBelow = windowHeight - selectRect.bottom;

    if (spaceBelow < optionsHeight && selectRect.top > optionsHeight) {
      optionsRef.current.style.bottom = "100%";
      optionsRef.current.style.top = "auto";
    } else {
      optionsRef.current.style.top = "100%";
      optionsRef.current.style.bottom = "auto";
    }
  }, [activeSelect, id]);

  useEffect(() => {
    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    return () => window.removeEventListener("resize", updateDropdownPosition);
  }, [updateDropdownPosition]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        selectRef.current &&
        !selectRef.current.contains(event.target as Node) &&
        activeSelect === id
      ) {
        close();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [close, activeSelect, id]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        toggleDropdown();
      } else if (event.key === "Escape" && activeSelect === id) {
        event.preventDefault();
        close();
      } else if (event.key === "Tab" && activeSelect === id) {
        close();
      }
    },
    [toggleDropdown, close, activeSelect, id]
  );

  return (
    <div
      ref={selectRef}
      className={`custom-select ${activeSelect === id ? "open" : ""}`}
      css={menuStyles}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div
        className="select-header"
        onClick={toggleDropdown}
        onKeyDown={handleKeyDown}
        tabIndex={tabIndex}
        role="button"
      >
        <span className="select-header-text">
          {selectedOption
            ? selectedOption.label
            : placeholder || "Select an option"}
        </span>
        <ChevronIcon
          className={`chevron ${activeSelect === id ? "open" : ""}`}
        />
      </div>
      {activeSelect === id && (
        <ul ref={optionsRef} className="options-list nowheel">
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
