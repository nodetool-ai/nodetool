/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useState, useEffect, useCallback } from "react";
import { IconButton, TextField, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ReplaceIcon from "@mui/icons-material/FindReplace";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

const MAX_SEARCH_LENGTH = 1000;

// Simple validation for search/replace terms
const isValidInput = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_SEARCH_LENGTH;
};

interface FindReplaceBarProps {
  onFind?: (searchTerm: string) => void;
  onReplace?: (
    searchTerm: string,
    replaceTerm: string,
    replaceAll?: boolean
  ) => void;
  onClose?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  currentMatch?: number;
  totalMatches?: number;
  isVisible?: boolean;
}

const styles = (theme: any) =>
  css({
    display: "flex",
    alignItems: "center",
    padding: "0.2em 0.5em 0.5em 1em",
    justifyContent: "start",
    backgroundColor: theme.palette.grey[800],
    gap: "0.5em",
    ".search-group": {
      display: "flex",
      alignItems: "center",
      margin: "0",
      gap: "0.2em"
    },
    ".search-input": {
      "& .MuiInputBase-root": {
        backgroundColor: theme.palette.grey[600],
        color: theme.palette.grey[0],
        fontSize: theme.fontSizeSmaller,
        border: "none",
        height: "2em",
        "& input": {
          padding: "0.5em .75em"
        }
      },
      "& .MuiInputBase-input::placeholder": {
        color: theme.palette.grey[200],
        opacity: 1
      },
      "& .MuiOutlinedInput-root": {
        "& fieldset": {
          border: "none"
        },
        "&:hover ": {
          opacity: 0.9
        },
        "&.Mui-focused": {
          color: theme.palette.grey[0],
          backgroundColor: theme.palette.grey[500]
        }
      }
    },
    ".replace-input": {
      "& .MuiInputBase-root": {
        backgroundColor: theme.palette.grey[600],
        color: theme.palette.grey[0],
        fontSize: theme.fontSizeSmaller,
        height: "2em",
        "& input": {
          padding: "0.5em"
        }
      },
      "& .MuiInputBase-input::placeholder": {
        color: theme.palette.grey[400],
        opacity: 1
      },
      "& .MuiOutlinedInput-root": {
        "& fieldset": {
          borderColor: theme.palette.grey[500]
        },
        "&:hover fieldset": {
          borderColor: theme.palette.grey[400]
        },
        "&.Mui-focused fieldset": {
          borderColor: theme.palette.grey[0]
        }
      }
    },
    ".match-info": {
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.grey[200],
      minWidth: "4em",
      textAlign: "center"
    },
    ".toolbar-button": {
      padding: "4px",
      marginRight: "0",
      color: `${theme.palette.grey[200]} !important`,
      backgroundColor: "transparent !important",
      borderRadius: "4px !important",
      "&:hover": {
        backgroundColor: `${theme.palette.grey[600]} !important`,
        color: `${theme.palette.grey[0]} !important`
      }
    }
  });

const FindReplaceBar = ({
  onFind,
  onReplace,
  onClose,
  onNext,
  onPrevious,
  currentMatch = 0,
  totalMatches = 0,
  isVisible = true
}: FindReplaceBarProps) => {
  const theme = useTheme();
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [showReplace, setShowReplace] = useState(false);

  // Handlers with proper length validation
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.slice(0, MAX_SEARCH_LENGTH);
      setSearchTerm(value);
    },
    []
  );

  const handleReplaceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.slice(0, MAX_SEARCH_LENGTH);
      setReplaceTerm(value);
    },
    []
  );

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (isValidInput(searchTerm) && onFind) {
        onFind(searchTerm);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, onFind]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        onPrevious?.();
      } else {
        onNext?.();
      }
    } else if (e.key === "Escape") {
      onClose?.();
    }
  };

  const handleReplace = useCallback(() => {
    if (onReplace && isValidInput(searchTerm)) {
      onReplace(searchTerm, replaceTerm, false);
    }
  }, [onReplace, searchTerm, replaceTerm]);

  const handleReplaceAll = useCallback(() => {
    if (onReplace && isValidInput(searchTerm)) {
      onReplace(searchTerm, replaceTerm, true);
    }
  }, [onReplace, searchTerm, replaceTerm]);

  if (!isVisible) return null;

  const isValidSearch = isValidInput(searchTerm);

  return (
    <div className="find-replace-bar" css={styles(theme)}>
      <div className="search-group">
        <TextField
          className="search-input"
          placeholder="Find..."
          size="small"
          value={searchTerm}
          onChange={handleSearchChange}
          onKeyDown={handleKeyDown}
          autoFocus
          slotProps={{
            htmlInput: {
              "aria-label": "Search text",
              maxLength: MAX_SEARCH_LENGTH
            }
          }}
        />

        <div
          className="match-info"
          style={{
            color: totalMatches > 0 ? "var(--c-white)" : "var(--c-gray5)"
          }}
        >
          {totalMatches > 0 ? `${currentMatch}/${totalMatches}` : "0/0"}
        </div>

        <Tooltip title="Previous" enterDelay={TOOLTIP_ENTER_DELAY}>
          <span>
            <IconButton
              className="toolbar-button"
              onClick={onPrevious}
              disabled={totalMatches === 0}
              size="small"
            >
              <KeyboardArrowUpIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Next" enterDelay={TOOLTIP_ENTER_DELAY}>
          <span>
            <IconButton
              className="toolbar-button"
              onClick={onNext}
              disabled={totalMatches === 0}
              size="small"
            >
              <KeyboardArrowDownIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Toggle Replace" enterDelay={TOOLTIP_ENTER_DELAY}>
          <IconButton
            className="toolbar-button"
            onClick={() => setShowReplace(!showReplace)}
            size="small"
          >
            <ReplaceIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      {showReplace && (
        <div className="search-group">
          <TextField
            className="replace-input"
            placeholder="Replace with..."
            size="small"
            value={replaceTerm}
            onChange={handleReplaceChange}
            onKeyDown={handleKeyDown}
            slotProps={{
              htmlInput: {
                "aria-label": "Replace text",
                maxLength: MAX_SEARCH_LENGTH
              }
            }}
          />

          <Tooltip title="Replace" enterDelay={TOOLTIP_ENTER_DELAY}>
            <span>
              <IconButton
                className="toolbar-button"
                onClick={handleReplace}
                disabled={!isValidSearch || totalMatches === 0}
                size="small"
              >
                Replace
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title="Replace All" enterDelay={TOOLTIP_ENTER_DELAY}>
            <span>
              <IconButton
                className="toolbar-button"
                onClick={handleReplaceAll}
                disabled={!isValidSearch || totalMatches === 0}
                size="small"
              >
                All
              </IconButton>
            </span>
          </Tooltip>
        </div>
      )}

      <Tooltip title="Close Find/Replace" enterDelay={TOOLTIP_ENTER_DELAY}>
        <IconButton className="toolbar-button" onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </div>
  );
};

export default memo(FindReplaceBar);
