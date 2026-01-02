/** @jsxImportSource @emotion/react */
import isEqual from "lodash/isEqual";
import React, {
  useCallback,
  useMemo,
  useRef,
  useEffect,
  memo,
  useId,
  useState
} from "react";
import useSelect from "../../hooks/nodes/useSelect";
import Fuse, { IFuseOptions } from "fuse.js";
import { Tooltip } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import { selectStyles } from "./selectStyles";

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
  label?: string;
  tabIndex?: number;
  fuseOptions?: IFuseOptions<Option>;
  /**
   * Value differs from default — shows visual indicator (right border)
   */
  changed?: boolean;
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

const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  label,
  tabIndex,
  fuseOptions,
  changed
}) => {
  const theme = useTheme();
  const selectRef = useRef<HTMLDivElement>(null);
  const optionsRef = useRef<HTMLUListElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { open, close, activeSelect, searchQuery, setSearchQuery } =
    useSelect();
  const id = useId();

  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const toggleDropdown = useCallback(() => {
    if (activeSelect === id) {
      close();
    } else {
      open(id);
    }
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
      {return;}

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

  // Focus search input when dropdown opens
  useEffect(() => {
    if (activeSelect === id && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [activeSelect, id]);

  const fuse = useMemo(() => {
    const defaultOptions: IFuseOptions<Option> = {
      keys: ["label"],
      threshold: 0.3,
      ignoreLocation: true
    };

    return new Fuse(options, {
      ...defaultOptions,
      ...fuseOptions
    });
  }, [options, fuseOptions]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (activeSelect !== id) {return;}

      const filteredOptions = searchQuery
        ? fuse.search(searchQuery).map(({ item }) => item)
        : options;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < filteredOptions.length - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredOptions.length - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (highlightedIndex >= 0) {
            handleOptionClick(filteredOptions[highlightedIndex].value);
          }
          break;
        case "Escape":
          e.preventDefault();
          close();
          break;
      }
    },
    [
      activeSelect,
      id,
      searchQuery,
      options,
      fuse,
      highlightedIndex,
      handleOptionClick,
      close
    ]
  );

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  // Memoize styles to avoid recalculation on each render
  const styles = useMemo(() => selectStyles(theme), [theme]);

  // Changed state styling for select-header
  const changedStyle = changed
    ? { borderRight: `2px solid ${theme.vars.palette.primary.main}` }
    : undefined;

  return (
    <div className="select-container" css={styles}>
      <Tooltip placement="top" enterDelay={TOOLTIP_ENTER_DELAY} disableInteractive title={label}>
        <div
          ref={selectRef}
          className={`custom-select select-wrapper ${
            activeSelect === id ? "open" : ""
          }`}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
        >
          {activeSelect !== id && (
            <div
              className="select-header"
              onClick={toggleDropdown}
              tabIndex={tabIndex}
              role="button"
              style={changedStyle}
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
          )}
          {activeSelect === id && (
            <>
              <input
                ref={searchInputRef}
                type="text"
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                onClick={(e) => e.stopPropagation()}
              />
              <ul ref={optionsRef} className="options-list nowheel">
                {(searchQuery
                  ? fuse.search(searchQuery).map(({ item }) => item)
                  : options
                ).map((option, index) => (
                  <li
                    key={option.value}
                    className={`option ${
                      option.value === value ? "selected" : ""
                    } ${index === highlightedIndex ? "highlighted" : ""}`}
                    onClick={() => handleOptionClick(option.value)}
                  >
                    {option.label}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Tooltip>
    </div>
  );
};

export default memo(Select, isEqual);
