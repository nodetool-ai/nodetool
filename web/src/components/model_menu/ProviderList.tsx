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
import {
  isHuggingFaceProvider,
  toTitleCase
} from "../../utils/providerDisplay";

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
        sx={{ py: 0.25 }}
      >
        <ListItemText
          primary="All providers"
          primaryTypographyProps={{ fontSize: "0.92rem" }}
        />
      </ListItemButton>
      {providers.map((p) => {
        const enabled = isProviderEnabled(p);
        const renderBadges = () => {
          const badges: Array<{ label: string }> = [];
          if (isHuggingFaceProvider(p)) {
            badges.push({ label: "HF" });
          } else if (/ollama|local|lmstudio/i.test(p)) {
            badges.push({ label: "Local" });
          } else {
            badges.push({ label: "API" });
          }
          return (
            <Box sx={{ display: "flex", gap: 0.5, ml: 0.75 }}>
              {badges.map((b) => (
                <span
                  key={b.label}
                  style={{
                    padding: "1px 5px",
                    fontSize: "0.68em",
                    lineHeight: 1.1,
                    borderRadius: 4,
                    background: "var(--palette-grey-700)",
                    color: "var(--palette-grey-100)",
                    letterSpacing: 0.2,
                    border: "1px solid var(--palette-grey-600)"
                  }}
                >
                  {b.label}
                </span>
              ))}
            </Box>
          );
        };
        return (
          <ListItemButton
            key={p}
            className={`model-menu__provider-item ${
              selected === p ? "is-selected" : ""
            }`}
            selected={selected === p}
            onClick={() => onSelect(p)}
            sx={{ gap: 0.1, opacity: enabled ? 1 : 0.55, py: 0.25 }}
          >
            <ListItemText
              primary={
                <Box sx={{ display: "flex", alignItems: "center" }}>
                  <span>{toTitleCase(p)}</span>
                  {renderBadges()}
                </Box>
              }
              primaryTypographyProps={{ fontSize: "0.92rem" }}
            />
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
