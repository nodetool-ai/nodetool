/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback, useEffect, useState } from "react";
import {
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress,
  Box,
  Typography
} from "@mui/material";
import { Search as SearchIcon, Clear as ClearIcon } from "@mui/icons-material";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetSearch } from "../../serverState/useAssetSearch";
import { useDebouncedCallback } from "use-debounce";
import ThemeNodetool from "../themes/ThemeNodetool";

const styles = (theme: any) =>
  css({
    "&": {
      width: "100%",
      maxWidth: "400px"
    },
    ".search-container": {
      position: "relative",
      width: "100%"
    },
    ".search-input": {
      width: "100%",
      "& .MuiOutlinedInput-root": {
        backgroundColor: theme.palette.c_gray0,
        borderRadius: "8px",
        fontSize: theme.fontSizeNormal,
        "& fieldset": {
          borderColor: theme.palette.c_gray2
        },
        "&:hover fieldset": {
          borderColor: theme.palette.c_gray3
        },
        "&.Mui-focused fieldset": {
          borderColor: theme.palette.c_hl1
        }
      },
      "& .MuiInputBase-input": {
        color: theme.palette.c_white,
        "&::placeholder": {
          color: theme.palette.c_gray4,
          opacity: 1
        }
      }
    },
    ".search-error": {
      marginTop: "0.5em",
      fontSize: theme.fontSizeSmaller,
      color: theme.palette.c_error
    }
  });

interface GlobalSearchInputProps {
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
}

const GlobalSearchInput: React.FC<GlobalSearchInputProps> = ({
  onFocus,
  onBlur,
  placeholder = "Search all assets..."
}) => {
  const [localQuery, setLocalQuery] = useState("");

  const { searchAssets, isSearching, searchError, clearError } =
    useAssetSearch();
  const {
    globalSearchQuery,
    isGlobalSearchActive,
    setGlobalSearchQuery,
    setIsGlobalSearchActive,
    setGlobalSearchResults
  } = useAssetGridStore();

  // Handle search execution
  const executeSearch = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setIsGlobalSearchActive(false);
        setGlobalSearchResults([]);
        setGlobalSearchQuery(query);
        return;
      }

      const result = await searchAssets(query);
      if (result) {
        setGlobalSearchResults(result.assets);
        setIsGlobalSearchActive(true);
        setGlobalSearchQuery(query);
      }
    },
    [
      searchAssets,
      setIsGlobalSearchActive,
      setGlobalSearchResults,
      setGlobalSearchQuery
    ]
  );

  // Debounced search function
  const debouncedSearch = useDebouncedCallback((query: string) => {
    executeSearch(query);
  }, 500);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setLocalQuery(value);
    clearError();
    debouncedSearch(value);
  };

  const handleClear = () => {
    setLocalQuery("");
    setGlobalSearchQuery("");
    setIsGlobalSearchActive(false);
    setGlobalSearchResults([]);
    clearError();
    debouncedSearch.cancel();
  };

  const handleFocus = () => {
    onFocus?.();
  };

  const handleBlur = () => {
    onBlur?.();
  };

  return (
    <Box css={styles} className="global-search-input">
      <div className="global-search-container search-container">
        <TextField
          className="global-search-field search-input"
          value={localQuery}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          variant="outlined"
          size="small"
          data-testid="global-search-input"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {isSearching ? (
                  <CircularProgress
                    size={20}
                    className="global-search-loading"
                    data-testid="global-search-loading"
                  />
                ) : (
                  <SearchIcon
                    style={{ color: "var(--c_gray4)" }}
                    className="global-search-icon"
                    data-testid="global-search-icon"
                  />
                )}
              </InputAdornment>
            ),
            endAdornment: localQuery && (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleClear}
                  edge="end"
                  style={{ color: "var(--c_gray4)" }}
                  className="global-search-clear-btn"
                  data-testid="global-search-clear"
                >
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            )
          }}
        />

        {searchError && (
          <Typography
            className="global-search-error search-error"
            data-testid="global-search-error"
          >
            {searchError}
          </Typography>
        )}
      </div>
    </Box>
  );
};

export default GlobalSearchInput;
