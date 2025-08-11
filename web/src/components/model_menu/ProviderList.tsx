/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React from "react";
import {
  List,
  ListItemButton,
  ListItemText,
  CircularProgress,
  Checkbox,
  Tooltip,
  Box
} from "@mui/material";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";

const listStyles = css({
  overflowY: "auto",
  maxHeight: "calc(100% - 20px)",
  fontSize: "0.92rem"
});

export interface ProviderListProps {
  providers: string[];
  selected: string | null;
  onSelect: (provider: string | null) => void;
  isLoading: boolean;
  isError: boolean;
}

const ProviderList: React.FC<ProviderListProps> = ({
  providers,
  selected,
  onSelect,
  isLoading,
  isError
}) => {
  const isProviderEnabled = useModelPreferencesStore(
    (s) => s.isProviderEnabled
  );
  const enabledProviders = useModelPreferencesStore((s) => s.enabledProviders);
  const setProviderEnabled = useModelPreferencesStore(
    (s) => s.setProviderEnabled
  );
  if (isLoading) {
    return (
      <div css={listStyles} className="model-menu__providers-list is-loading">
        <CircularProgress size={20} />
      </div>
    );
  }
  if (isError) {
    return (
      <div css={listStyles} className="model-menu__providers-list is-error">
        Error loading providers
      </div>
    );
  }
  return (
    <List dense css={listStyles} className="model-menu__providers-list">
      <ListItemButton
        className={`model-menu__provider-item ${
          selected === null ? "is-selected" : ""
        }`}
        selected={selected === null}
        onClick={() => onSelect(null)}
      >
        <ListItemText primary="All providers" />
      </ListItemButton>
      {providers.map((p) => {
        const enabled = isProviderEnabled(p);
        return (
          <ListItemButton
            key={p}
            className={`model-menu__provider-item ${
              selected === p ? "is-selected" : ""
            }`}
            selected={selected === p}
            onClick={() => onSelect(p)}
            sx={{ gap: 0.1, opacity: enabled ? 1 : 0.55 }}
          >
            <ListItemText primary={p} />
            <Box sx={{ ml: "auto" }} onClick={(e) => e.stopPropagation()}>
              <Tooltip title={enabled ? "Disable provider" : "Enable provider"}>
                <Checkbox
                  edge="end"
                  size="small"
                  sx={{
                    padding: 0,
                    "& .MuiSvgIcon-root": {
                      fontSize: "1.2rem"
                    }
                  }}
                  checked={enabled}
                  onChange={(e) => {
                    setProviderEnabled(p, e.target.checked);
                  }}
                />
              </Tooltip>
            </Box>
          </ListItemButton>
        );
      })}
    </List>
  );
};

export default ProviderList;
