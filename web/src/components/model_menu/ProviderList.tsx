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
  Box,
  Button
} from "@mui/material";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import {
  isHuggingFaceProvider,
  toTitleCase
} from "../../utils/providerDisplay";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

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
  const secrets = useRemoteSettingsStore((s) => s.secrets);
  const setMenuOpen = useSettingsStore((s) => s.setMenuOpen);

  const requiredSecretForProvider = (provider?: string): string | null => {
    const p = (provider || "").toLowerCase();
    if (p.includes("openai")) return "OPENAI_API_KEY";
    if (p.includes("anthropic")) return "ANTHROPIC_API_KEY";
    if (p.includes("gemini") || p.includes("google")) return "GEMINI_API_KEY";
    if (p.includes("replicate")) return "REPLICATE_API_TOKEN";
    if (p.includes("aime")) return "AIME_API_KEY";
    return null;
  };
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
        const env = requiredSecretForProvider(p);
        const available =
          !env ||
          Boolean(secrets?.[env] && String(secrets?.[env]).trim().length > 0);
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
            sx={{ gap: 0.1, opacity: enabled && available ? 1 : 0.5, py: 0.25 }}
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
            {!available && (
              <Box
                sx={{ mr: 1, display: "flex", alignItems: "center", gap: 0.5 }}
                onClick={(e) => e.stopPropagation()}
              >
                <Tooltip title="API key required">
                  <InfoOutlinedIcon
                    sx={{ fontSize: 16, color: "warning.main" }}
                  />
                </Tooltip>
                <Tooltip title="Open Settings to add API key">
                  <Button
                    size="small"
                    variant="text"
                    color="warning"
                    sx={{ minWidth: "auto", p: 0, fontSize: "0.75rem" }}
                    onClick={() => setMenuOpen(true, 1)}
                  >
                    Add key
                  </Button>
                </Tooltip>
              </Box>
            )}
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
