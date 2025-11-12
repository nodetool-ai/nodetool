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
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import { useSettingsStore } from "../../stores/SettingsStore";
import {
  isHuggingFaceProvider,
  isHuggingFaceLocalProvider,
  getProviderBaseName,
  formatGenericProviderName,
  getProviderUrl
} from "../../utils/providerDisplay";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import {
  ModelMenuStoreHook,
  requiredSecretForProvider,
  useLanguageModelMenuStore
} from "../../stores/ModelMenuStore";
import { useSecrets } from "../../hooks/useSecrets";

const listStyles = css({
  overflowY: "auto",
  maxHeight: "calc(100% - 20px)"
});

export interface ProviderListProps {
  providers: string[];
  isLoading: boolean;
  isError: boolean;
  storeHook?: ModelMenuStoreHook<any>;
}

const ProviderList: React.FC<ProviderListProps> = ({
  providers,
  isLoading,
  isError,
  storeHook = useLanguageModelMenuStore
}) => {
  const theme = useTheme();
  const selected = storeHook((s) => s.selectedProvider);
  const setSelected = storeHook((s) => s.setSelectedProvider);
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [menuProvider, setMenuProvider] = React.useState<string | null>(null);
  const isProviderEnabled = useModelPreferencesStore(
    (s) => s.isProviderEnabled
  );
  const enabledProviders = useModelPreferencesStore((s) => s.enabledProviders);
  const setProviderEnabled = useModelPreferencesStore(
    (s) => s.setProviderEnabled
  );
  const { isApiKeySet } = useSecrets();
  const setMenuOpen = useSettingsStore((s) => s.setMenuOpen);

  // Sort providers: enabled first (alphabetical), then disabled (alphabetical)
  const sortedProviders = React.useMemo(() => {
    // Use enabledProviders map directly to avoid expensive re-computation via selector functions
    const map = enabledProviders || {};
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
    const result = { enabledList, disabledList };
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
        onClick={() => setSelected(null)}
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
          const normKey = /gemini|google/i.test(p) ? "gemini" : p;
          const providerEnabled = (enabledProviders || {})[normKey] !== false;
          const hasKey = env ? isApiKeySet(env) : true;
          const available = providerEnabled && hasKey;
          const renderBadges = () => {
            const badges: Array<{ label: string }> = [];
            const isHF = isHuggingFaceProvider(p);
            const isHFLocal = isHuggingFaceLocalProvider(p);
            const isLocal = /ollama|local|lmstudio|llama[_-]?cpp|mlx/i.test(p);
            
            if (isHF) {
              badges.push({ label: "HF" });
            }
            if (isHFLocal || isLocal) {
              badges.push({ label: "Local" });
            }
            if (!isHF && !isLocal && !isHFLocal) {
              badges.push({ label: "API" });
            }
            
            return (
              <Box sx={{ display: "flex", gap: 0.5 }}>
                {badges.map((b) => {
                  const tooltipTitle =
                    b.label === "HF"
                      ? "HuggingFace: Models from the Hugging Face Hub."
                      : b.label === "Local"
                      ? "Local: Runs locally on your machine."
                      : "API: Remote provider; runs via API without local download. Requires API key.";
                  return (
                    <Tooltip
                      key={b.label}
                      title={tooltipTitle}
                      enterDelay={TOOLTIP_ENTER_DELAY * 2}
                      enterNextDelay={TOOLTIP_ENTER_NEXT_DELAY * 2}
                    >
                      <span
                        style={{
                          padding: "1px 5px",
                          fontSize: theme.vars.fontSizeTiny,
                          lineHeight: 1.1,
                          borderRadius: 4,
                          background: "transparent",
                          color:
                            b.label === "API"
                              ? theme.vars.palette.c_provider_api
                              : b.label === "Local"
                              ? theme.vars.palette.c_provider_local
                              : theme.vars.palette.c_provider_hf,
                          letterSpacing: 0.2,
                          border: `1px solid currentColor`
                        }}
                      >
                        {b.label}
                      </span>
                    </Tooltip>
                  );
                })}
              </Box>
            );
          };
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
                onClick={() => setSelected(p)}
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
                  slotProps={{
                    primary: {
                      sx: {
                        fontSize: (theme) => theme.vars.fontSizeSmall
                      }
                    }
                  }}
                />
                {!hasKey && (
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
                        setProviderEnabled(p, e.target.checked);
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
