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

interface SearchBarProps {
  inputValue: string;
  nodesOnlySearch: boolean;
  onInputChange: (value: string) => void;
  onToggleNodeSearch: (checked: boolean) => void;
  onClear: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({
  inputValue,
  nodesOnlySearch,
  onInputChange,
  onToggleNodeSearch,
  onClear
}) => {
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
        onChange={(e) => onInputChange(e.target.value)}
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
              onChange={(e) => onToggleNodeSearch(e.target.checked)}
              size="small"
            />
          }
          label="Node Search"
        />
      </Tooltip>
    </Box>
  );
};

export default SearchBar;
