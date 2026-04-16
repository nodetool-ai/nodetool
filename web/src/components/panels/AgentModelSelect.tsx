/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import SearchIcon from "@mui/icons-material/Search";
import CheckIcon from "@mui/icons-material/Check";
import { Popover } from "../ui_primitives";

export interface AgentModelOption {
  id: string;
  label: string;
}

interface AgentModelSelectProps {
  value: string;
  options: AgentModelOption[];
  onChange: (id: string) => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
}

const triggerStyles = (theme: Theme, disabled: boolean) => css({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  height: 26,
  maxWidth: 220,
  minWidth: 90,
  padding: "0 6px 0 10px",
  borderRadius: 8,
  border: `1px solid ${theme.vars.palette.divider}`,
  background: "rgba(0,0,0,0.45)",
  color: theme.vars.palette.grey[100],
  fontFamily: theme.fontFamily2,
  fontSize: theme.fontSizeSmaller,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.5 : 1,
  transition: "border-color .15s ease, background-color .15s ease",
  "&:hover": !disabled
    ? {
        borderColor: theme.vars.palette.primary.main,
        background: "rgba(0,0,0,0.6)"
      }
    : undefined,
  "& .label": {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    textAlign: "left"
  },
  "& svg": {
    fontSize: 14,
    opacity: 0.7,
    flexShrink: 0
  }
});

const popupStyles = (theme: Theme) => css({
  width: 320,
  maxHeight: 360,
  display: "flex",
  flexDirection: "column",
  background: "#0A0A0A",
  color: theme.vars.palette.grey[100],
  border: `1px solid rgba(255,255,255,0.08)`,
  borderRadius: 10,
  boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
  overflow: "hidden",
  fontFamily: theme.fontFamily2,

  ".search-row": {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "#111"
  },
  ".search-row svg": {
    fontSize: 14,
    opacity: 0.6
  },
  ".search-input": {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: theme.vars.palette.grey[100],
    fontFamily: theme.fontFamily2,
    fontSize: theme.fontSizeSmall,
    padding: "2px 0",
    "&::placeholder": {
      color: "rgba(255,255,255,0.35)"
    }
  },
  ".list": {
    flex: 1,
    overflowY: "auto",
    padding: "4px 0",
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(255,255,255,0.15) transparent"
  },
  ".list::-webkit-scrollbar": {
    width: 6
  },
  ".list::-webkit-scrollbar-thumb": {
    background: "rgba(255,255,255,0.15)",
    borderRadius: 3
  },
  ".option": {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    fontSize: theme.fontSizeSmall,
    cursor: "pointer",
    color: theme.vars.palette.grey[100],
    transition: "background-color .1s ease",
    "&:hover, &[data-active='true']": {
      background: "rgba(255,255,255,0.06)"
    },
    "&[data-selected='true']": {
      color: theme.vars.palette.primary.light
    }
  },
  ".option .label": {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  ".option svg": {
    fontSize: 14,
    flexShrink: 0
  },
  ".empty": {
    padding: "16px 12px",
    textAlign: "center",
    color: "rgba(255,255,255,0.4)",
    fontSize: theme.fontSizeSmall
  }
});

const AgentModelSelectInner: React.FC<AgentModelSelectProps> = ({
  value,
  options,
  onChange,
  disabled = false,
  loading = false,
  placeholder = "Model"
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const open = Boolean(anchorEl);
  const isDisabled = disabled || loading;

  const selectedLabel = useMemo(() => {
    if (loading) return "Loading…";
    const match = options.find((o) => o.id === value);
    return match?.label ?? placeholder;
  }, [options, value, loading, placeholder]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    // With an empty query, the filtered list equals `options`, so we index
    // into that to highlight the currently selected model.
    setActiveIndex(Math.max(0, options.findIndex((o) => o.id === value)));
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, options, value]);

  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(filtered.length === 0 ? -1 : filtered.length - 1);
    }
  }, [filtered.length, activeIndex]);

  const handleOpen = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (isDisabled) return;
    setAnchorEl(e.currentTarget);
  }, [isDisabled]);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handlePick = useCallback(
    (id: string) => {
      onChange(id);
      setAnchorEl(null);
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const pick = filtered[activeIndex];
        if (pick) handlePick(pick.id);
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    },
    [filtered, activeIndex, handlePick, handleClose]
  );

  // Keep the highlighted option scrolled into view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(
      `[data-index="${activeIndex}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  return (
    <>
      <button
        type="button"
        css={triggerStyles(theme, isDisabled)}
        onClick={handleOpen}
        disabled={isDisabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Agent model"
      >
        <span className="label">{selectedLabel}</span>
        <KeyboardArrowDownIcon />
      </button>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        placement="bottom-left"
        paperSx={{
          mt: 0.5,
          background: "transparent",
          border: "none",
          boxShadow: "none",
          overflow: "visible"
        }}
      >
        <div css={popupStyles(theme)}>
          <div className="search-row">
            <SearchIcon />
            <input
              ref={searchRef}
              className="search-input"
              type="text"
              placeholder="Search models…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="list" ref={listRef} role="listbox">
            {filtered.length === 0 ? (
              <div className="empty">No models match</div>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.id === value;
                const isActive = index === activeIndex;
                return (
                  <div
                    key={option.id}
                    className="option"
                    role="option"
                    aria-selected={isSelected}
                    data-index={index}
                    data-active={isActive}
                    data-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => handlePick(option.id)}
                  >
                    <span className="label">{option.label}</span>
                    {isSelected && <CheckIcon />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Popover>
    </>
  );
};

export const AgentModelSelect = memo(AgentModelSelectInner);
