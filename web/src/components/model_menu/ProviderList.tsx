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
  Button,
  Menu,
  MenuItem,
  Divider
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import {
  isHuggingFaceProvider,
  getProviderBaseName,
  formatGenericProviderName,
  getProviderUrl
} from "../../utils/providerDisplay";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

const listStyles = css({
  overflowY: "auto",
  maxHeight: "calc(100% - 20px)"
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
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [menuProvider, setMenuProvider] = React.useState<string | null>(null);
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
  // Sort providers: enabled first (alphabetical), then disabled (alphabetical)
  const sortedProviders = React.useMemo(() => {
    console.time("[ProviderList] sort");
    // Use enabledProviders map directly to avoid expensive re-computation via selector functions
    const map = enabledProviders || {};
    console.time("[ProviderList] sort:build");
    const withLabels = providers.map((p) => {
      const label = isHuggingFaceProvider(p)
        ? getProviderBaseName(p)
        : formatGenericProviderName(p);
      const enabled = map[p] !== false; // default enabled
      return { p, label, enabled };
    });
    const enabledList = withLabels
      .filter((x) => x.enabled)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((x) => x.p);
    const disabledList = withLabels
      .filter((x) => !x.enabled)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((x) => x.p);
    console.timeEnd("[ProviderList] sort:build");
    const result = { enabledList, disabledList };
    console.timeEnd("[ProviderList] sort");
    return result;
  }, [providers, enabledProviders]);

  return (
    <List
      dense
      css={listStyles}
      className="model-menu__providers-list"
      sx={{ fontSize: (theme) => theme.vars.fontSizeSmall }}
    >
      {isLoading && (
        <div className="is-loading" style={{ padding: 8 }}>
          <CircularProgress size={20} />
        </div>
      )}
      {isError && (
        <div className="is-error" style={{ padding: 8 }}>
          Error loading providers
        </div>
      )}
      <ListItemButton
        disableRipple
        className={`model-menu__provider-item ${
          selected === null ? "is-selected" : ""
        }`}
        selected={selected === null}
        onClick={() => onSelect(null)}
        sx={{ py: 0.25 }}
      >
        <ListItemText
          primary="All providers"
          primaryTypographyProps={{
            sx: { fontSize: (theme) => theme.vars.fontSizeSmall }
          }}
        />
      </ListItemButton>
      {[...sortedProviders.enabledList, ...sortedProviders.disabledList].map(
        (p, idx) => {
          const enabled = isProviderEnabled(p);
          const showDivider =
            idx === sortedProviders.enabledList.length &&
            sortedProviders.disabledList.length > 0;
          const env = requiredSecretForProvider(p);
          const available =
            !env ||
            Boolean(secrets?.[env] && String(secrets?.[env]).trim().length > 0);
          const renderBadges = () => {
            const badges: Array<{ label: string }> = [];
            let kind: "api" | "local" | "hf" = "api";
            if (isHuggingFaceProvider(p)) kind = "hf";
            else if (/ollama|local|lmstudio/i.test(p)) kind = "local";
            badges.push({
              label: kind === "hf" ? "HF" : kind === "local" ? "Local" : "API"
            });
            return (
              <Box sx={{ display: "flex", gap: 0.5 }}>
                {badges.map((b) => (
                  <span
                    key={b.label}
                    style={{
                      padding: "1px 5px",
                      fontSize: theme.vars.fontSizeTiny,
                      lineHeight: 1.1,
                      borderRadius: 4,
                      background: "transparent",
                      color:
                        b.label === "API"
                          ? theme.vars.palette.providerApi
                          : b.label === "Local"
                          ? theme.vars.palette.providerLocal
                          : theme.vars.palette.providerHf,
                      letterSpacing: 0.2,
                      border: `1px solid currentColor`
                    }}
                  >
                    {b.label}
                  </span>
                ))}
              </Box>
            );
          };
          const providerUrl = getProviderUrl(p);
          return (
            <React.Fragment key={`provider-item-${p}`}>
              {showDivider && (
                <Divider component="li" sx={{ my: 0.5, opacity: 0.5 }} />
              )}
              <ListItemButton
                disableRipple
                className={`model-menu__provider-item ${
                  selected === p ? "is-selected" : ""
                }`}
                selected={selected === p}
                onClick={() => onSelect(p)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenuAnchor(e.currentTarget);
                  setMenuProvider(p);
                }}
                sx={{
                  gap: 0.1,
                  opacity: enabled && available ? 1 : 0.5,
                  py: 0.25
                }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center" }}>
                      <span>
                        {isHuggingFaceProvider(p)
                          ? getProviderBaseName(p)
                          : formatGenericProviderName(p)}
                      </span>
                    </Box>
                  }
                  primaryTypographyProps={{
                    sx: { fontSize: (theme) => theme.vars.fontSizeSmall }
                  }}
                />
                {!available && (
                  <Box
                    sx={{
                      mr: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Tooltip title="API key required">
                      <InfoOutlinedIcon
                        sx={{
                          fontSize: (theme) => theme.vars.fontSizeNormal,
                          color: "warning.main"
                        }}
                      />
                    </Tooltip>
                    <Tooltip title="Open Settings to add API key">
                      <Button
                        size="small"
                        variant="text"
                        color="warning"
                        sx={{
                          minWidth: "auto",
                          p: 0,
                          fontSize: (theme) => theme.vars.fontSizeSmaller
                        }}
                        onClick={() => setMenuOpen(true, 1)}
                      >
                        Add key
                      </Button>
                    </Tooltip>
                  </Box>
                )}
                <Box
                  sx={{
                    ml: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Right-aligned badges */}
                  {renderBadges()}
                  <Tooltip
                    title={enabled ? "Disable provider" : "Enable provider"}
                  >
                    <Checkbox
                      edge="end"
                      size="small"
                      sx={{
                        padding: 0,
                        "& .MuiSvgIcon-root": {
                          fontSize: (theme) => theme.vars.fontSizeBig
                        }
                      }}
                      checked={enabled}
                      onChange={(e) => {
                        console.time("[ProviderList] toggle");
                        setProviderEnabled(p, e.target.checked);
                        console.timeEnd("[ProviderList] toggle");
                      }}
                    />
                  </Tooltip>
                </Box>
              </ListItemButton>
            </React.Fragment>
          );
        }
      )}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => {
          setMenuAnchor(null);
          setMenuProvider(null);
        }}
      >
        <MenuItem
          disabled={!menuProvider || !getProviderUrl(menuProvider)}
          onClick={() => {
            const url = getProviderUrl(menuProvider || undefined);
            if (url) window.open(url, "_blank");
            setMenuAnchor(null);
            setMenuProvider(null);
          }}
        >
          Open provider website
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuProvider) {
              const next = !isProviderEnabled(menuProvider);
              setProviderEnabled(menuProvider, next);
            }
            setMenuAnchor(null);
            setMenuProvider(null);
          }}
        >
          {menuProvider && isProviderEnabled(menuProvider)
            ? "Disable provider"
            : "Enable provider"}
        </MenuItem>
      </Menu>
    </List>
  );
};

export default ProviderList;
