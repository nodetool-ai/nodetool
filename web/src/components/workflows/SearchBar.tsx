/** @jsxImportSource @emotion/react */
import {
  Box,
  TextField,
  Tooltip,
  Switch,
  FormControlLabel,
  IconButton,
  InputAdornment
} from "@mui/material";
import { Clear as ClearIcon } from "@mui/icons-material";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_LEAVE_DELAY
} from "../../config/constants";
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

  const handleToggleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onToggleNodeSearch(e.target.checked);
  }, [onToggleNodeSearch]);

  return (
    <Box className="search-container">
      <TextField
        className="search-field"
        style={{
          transition: "background-color 0.3s ease",
          backgroundColor: nodesOnlySearch
            ? "var(--palette-primary-dark)"
            : "transparent"
        }}
        placeholder={
          nodesOnlySearch
            ? "Find examples that use a specific node..."
            : "Find examples by name or description..."
        }
        variant="outlined"
        size="small"
        value={inputValue}
        onChange={handleInputChange}
        slotProps={{
          input: {
            endAdornment: inputValue && (
              <InputAdornment position="end">
                <IconButton
                  aria-label="clear search"
                  onClick={onClear}
                  edge="end"
                  size="small"
                >
                  <ClearIcon />
                </IconButton>
              </InputAdornment>
            )
          }
        }}
      />
      <Tooltip
        title="Search for Nodes used in the example workflows"
        enterDelay={TOOLTIP_ENTER_DELAY}
        leaveDelay={TOOLTIP_LEAVE_DELAY}
      >
        <FormControlLabel
          className="search-switch"
          control={
            <Switch
              checked={nodesOnlySearch}
              onChange={handleToggleChange}
              size="small"
            />
          }
          label="Node Search"
        />
      </Tooltip>
    </Box>
  );
});

SearchBar.displayName = "SearchBar";

export default SearchBar;
