/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { forwardRef, memo, useCallback } from "react";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";

import { ToolbarIconButton, MOTION, BORDER_RADIUS } from "../ui_primitives";

const styles = (theme: Theme) =>
  css({
    "&.qa-search": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: theme.spacing(1, 1),
      borderRadius: BORDER_RADIUS.md,
      background: theme.vars.palette.background.paper,
      border: `1px solid ${theme.vars.palette.divider}`,
      transition: `border-color ${MOTION.fast}`,
      "&:focus-within": {
        borderColor: theme.vars.palette.primary.main
      }
    },
    "& input": {
      flex: 1,
      minWidth: 0,
      background: "transparent",
      border: "none",
      outline: "none",
      color: theme.vars.palette.text.primary,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeNormal,
      padding: theme.spacing(0.5, 0.5)
    },
    "& svg.search-glyph": {
      fontSize: 16,
      color: theme.vars.palette.text.secondary
    }
  });

interface CategorySearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Slim search input shown at the top of a tile-grid category. Filters the
 * grid below by title/node_type/namespace substring. Plan §7.4.
 */
const CategorySearchBar = memo(
  forwardRef<HTMLInputElement, CategorySearchBarProps>(
    ({ value, onChange, placeholder = "Filter..." }, ref) => {
      const theme = useTheme();
      const handleClear = useCallback(() => onChange(""), [onChange]);

      return (
        <div css={styles(theme)} className="qa-search">
          <SearchIcon className="search-glyph" />
          <input
            ref={ref}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label="Filter category"
          />
          {value && (
            <ToolbarIconButton
              tabIndex={-1}
              ariaLabel="Clear filter"
              onClick={handleClear}
              icon={<ClearIcon />}
            />
          )}
        </div>
      );
    }
  )
);

CategorySearchBar.displayName = "CategorySearchBar";

export default CategorySearchBar;
