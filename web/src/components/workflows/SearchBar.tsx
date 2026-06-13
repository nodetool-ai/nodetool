/** @jsxImportSource @emotion/react */
import {
  InputAdornment
} from "@mui/material";
import {
  Clear as ClearIcon,
  Search as SearchIcon,
  AccountTree as NodeSearchIcon
} from "@mui/icons-material";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_LEAVE_DELAY
} from "../../config/constants";
import { Tooltip, ToolbarIconButton, Box, TextInput } from "../ui_primitives";
import React, { memo, useCallback } from "react";

interface SearchBarProps {
  inputValue: string;
  nodesOnlySearch: boolean;
  onInputChange: (value: string) => void;
  onToggleNodeSearch: (checked: boolean) => void;
  onClear: () => void;
}

const SearchBar = memo(({
  inputValue,
  nodesOnlySearch,
  onInputChange,
  onToggleNodeSearch,
  onClear
}: SearchBarProps) => {
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onInputChange(e.target.value);
  }, [onInputChange]);

  const toggleNodeSearch = useCallback(() => {
    onToggleNodeSearch(!nodesOnlySearch);
  }, [nodesOnlySearch, onToggleNodeSearch]);

  return (
    <Box className="search-container">
      <TextInput
        className="search-field"
        placeholder={
          nodesOnlySearch
            ? "Find templates by node type (e.g. nodetool.email.GmailSearch)"
            : "Search templates by name, description, or tag…"
        }
        variant="outlined"
        size="small"
        value={inputValue}
        onChange={handleInputChange}
        autoFocus
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon
                  fontSize="small"
                  sx={{ color: "text.secondary" }}
                />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end" sx={{ gap: 0.5 }}>
                {inputValue && (
                  <ToolbarIconButton
                    aria-label="clear search"
                    onClick={onClear}
                    size="small"
                    icon={<ClearIcon />}
                    nodrag={false}
                  />
                )}
                <Tooltip
                  title={
                    nodesOnlySearch
                      ? "Searching node types — click to switch to text search"
                      : "Advanced: search by node type"
                  }
                  delay={TOOLTIP_ENTER_DELAY}
                  leaveDelay={TOOLTIP_LEAVE_DELAY}
                >
                  <ToolbarIconButton
                    aria-label="Toggle node search"
                    aria-pressed={nodesOnlySearch}
                    onClick={toggleNodeSearch}
                    size="small"
                    icon={
                      <NodeSearchIcon
                        sx={{
                          color: nodesOnlySearch
                            ? "primary.main"
                            : "text.secondary"
                        }}
                      />
                    }
                    nodrag={false}
                  />
                </Tooltip>
              </InputAdornment>
            )
          }
        }}
        fullWidth={false}
      />
    </Box>
  );
});

SearchBar.displayName = "SearchBar";

export default SearchBar;
