/** @jsxImportSource @emotion/react */
import { css, useTheme } from "@emotion/react";
import { memo, useState, useEffect } from "react";
import { IconButton, TextField, Tooltip } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ReplaceIcon from "@mui/icons-material/FindReplace";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";

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
    padding: "0.5em .5em 0 .5em",
    justifyContent: "start",
    backgroundColor: theme.palette.c_gray1,
    gap: "0.5em",
    minHeight: "3em",
    ".search-group": {
      display: "flex",
      alignItems: "center",
      gap: "0.2em"
    },
    ".search-input": {
      "& .MuiInputBase-root": {
        backgroundColor: theme.palette.c_gray2,
        color: theme.palette.c_white,
        fontSize: theme.fontSizeSmaller,
        border: "none",
        height: "2em",
        "& input": {
          padding: "0.5em .75em"
        }
      },
      "& .MuiInputBase-input::placeholder": {
        color: theme.palette.c_gray4,
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
          color: theme.palette.c_white,
          backgroundColor: theme.palette.c_gray3
        }
      }
    },
    ".replace-input": {
      "& .MuiInputBase-root": {
        backgroundColor: theme.palette.c_gray2,
        color: theme.palette.c_white,
        fontSize: theme.fontSizeSmaller,
        height: "2em",
        "& input": {
          padding: "0.5em"
        }
      },
      "& .MuiInputBase-input::placeholder": {
        color: theme.palette.c_gray4,
        opacity: 1
      },
      "& .MuiOutlinedInput-root": {
        "& fieldset": {
          borderColor: theme.palette.c_gray3
        },
        "&:hover fieldset": {
          borderColor: theme.palette.c_gray4
        },
        "&.Mui-focused fieldset": {
          borderColor: theme.palette.c_white
        }
      }
    },
    ".match-info": {
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_gray5,
      minWidth: "4em",
      textAlign: "center"
    },
    ".toolbar-button": {
      padding: "4px",
      marginRight: "0",
      color: `${theme.palette.c_gray5} !important`,
      backgroundColor: "transparent !important",
      borderRadius: "4px !important",
      "&:hover": {
        backgroundColor: `${theme.palette.c_gray2} !important`,
        color: `${theme.palette.c_white} !important`
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

  // Debounced search effect - only depends on searchTerm, not onFind
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchTerm && searchTerm.trim() && onFind) {
        onFind(searchTerm);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]); // Only depend on searchTerm to avoid infinite re-renders

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

  const handleReplace = () => {
    if (onReplace) {
      onReplace(searchTerm, replaceTerm, false);
    }
  };

  const handleReplaceAll = () => {
    if (onReplace) {
      onReplace(searchTerm, replaceTerm, true);
    }
  };

  if (!isVisible) return null;

  return (
    <div css={styles(theme)}>
      <div className="search-group">
        <TextField
          className="search-input"
          placeholder="Find..."
          size="small"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
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
            onChange={(e) => setReplaceTerm(e.target.value)}
            onKeyDown={handleKeyDown}
          />

          <Tooltip title="Replace" enterDelay={TOOLTIP_ENTER_DELAY}>
            <span>
              <IconButton
                className="toolbar-button"
                onClick={handleReplace}
                disabled={!searchTerm || totalMatches === 0}
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
                disabled={!searchTerm || totalMatches === 0}
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
