/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { isEqual } from "lodash";
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
    ".select-container": {
      display: "block",
      width: "100%"
    },
    ".select-wrapper": {
      position: "relative",
      flex: 1,
      minWidth: 0,
      height: "36px",
      minHeight: "36px"
    },
    ".options-list": {
      position: "absolute",
      top: "-10px",
      width: "auto",
      minWidth: "100%",
      maxWidth: "300px",
      maxHeight: "300px",
      overflowY: "auto",
      padding: ".5em 0",
      listStyle: "none",
      backgroundColor: theme.palette.c_node_bg,
      border: `1px solid var(--palette-grey-800)`,
      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.5)",
      borderRadius: ".3em",
      zIndex: 1000,
      whiteSpace: "nowrap"
    },
    ".options-list .option:first-of-type": {
      color: theme.palette.grey[500]
    },

    ".option": {
      padding: ".1em 1em",
      cursor: "pointer",
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.grey[200],
      transition: "all 0.2s ease",
      whiteSpace: "nowrap",

      "&:hover": {
        backgroundColor: theme.palette.grey[600],
        color: theme.palette.grey[0]
      },

      "&.matching": {
        backgroundColor: theme.palette.grey[500],
        fontWeight: "bold"
      },

      "&.selected": {
        backgroundColor: theme.palette.grey[600],
        color: "var(--palette-primary-main)"
      },

      "&.highlighted": {
        backgroundColor: theme.palette.grey[500],
        color: theme.palette.grey[0]
      }
    },

    ".select-header": {
      position: "absolute",
      width: "100%",
      top: "0px",
      height: "22",
      padding: "0px 5px",
      margin: "0",
      border: `1px solid ${theme.palette.grey[600]}`,
      fontSize: theme.fontSizeSmaller,
      borderRadius: ".3em",
      cursor: "pointer",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: theme.palette.c_node_bg,

      "&:hover": {
        borderColor: theme.palette.grey[400]
      }
    },

    ".select-header-text": {
      color: theme.palette.grey[100],
      fontSize: theme.fontSizeTiny,
      userSelect: "none"
    },

    ".chevron": {
      transition: "transform 0.2s ease",
      color: theme.palette.grey[400],
      transform: "rotate(0deg)",

      "&.open": {
        transform: "rotate(180deg)"
      }
    },

    ".search-input": {
      marginTop: "-2px",
      position: "absolute",
      top: "1px",
      zIndex: 11111,
      width: "100%",
      margin: "-4px 0 0 0",
      padding: "3px .5em",
      backgroundColor: theme.palette.grey[800],
      border: `1px solid ${theme.palette.grey[500]}`,
      borderRadius: ".3em",
      color: theme.palette.grey[0],
      fontSize: theme.fontSizeSmaller,

      "&:focus": {
        outline: "none",
        borderColor: theme.palette.grey[400]
      }
    }
  });

const Select: React.FC<SelectProps> = ({
  options,
  value,
  onChange,
  placeholder,
  label,
  tabIndex,
  fuseOptions
}) => {
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
      if (activeSelect !== id) return;

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

  return (
    <div className="select-container" css={menuStyles}>
      <Tooltip title={label}>
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
