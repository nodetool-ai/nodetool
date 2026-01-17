/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { useCallback } from "react";
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
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import { useTheme } from "@mui/material/styles";
import {
  TOOLTIP_ENTER_DELAY,
  TOOLTIP_ENTER_NEXT_DELAY
} from "../../config/constants";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";

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
  forceUnselect?: boolean;
  iconOnly?: boolean;
}

const ProviderList: React.FC<ProviderListProps> = ({
  providers,
  isLoading,
  isError,
  storeHook = useLanguageModelMenuStore,
  forceUnselect = false,
  iconOnly = false
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

  const handleSelectNull = useCallback(() => {
    setSelected(null);
  }, [setSelected]);

  const _handleSelectProvider = useCallback((p: string) => {
    setSelected(p);
  }, [setSelected]);

  const _handleMenuOpen = useCallback((e: React.MouseEvent<HTMLElement>, p: string) => {
    e.preventDefault();
    setMenuAnchor(e.currentTarget);
    setMenuProvider(p);
  }, []);

  const handleMenuClose = useCallback(() => {
    setMenuAnchor(null);
    setMenuProvider(null);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setMenuOpen(true, 1);
  }, [setMenuOpen]);

  const _handleCheckboxChange = useCallback((p: string, enabled: boolean) => {
    setProviderEnabled(p, enabled);
  }, [setProviderEnabled]);

  const handleStopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleOpenWebsite = useCallback(() => {
    const url = getProviderUrl(menuProvider || undefined);
    if (url) { window.open(url, "_blank"); }
    handleMenuClose();
  }, [menuProvider, handleMenuClose]);

  const handleToggleProvider = useCallback(() => {
    if (menuProvider) {
      const next = !isProviderEnabled(menuProvider);
      setProviderEnabled(menuProvider, next);
    }
    handleMenuClose();
  }, [menuProvider, isProviderEnabled, setProviderEnabled, handleMenuClose]);

  return (
    <List
      dense
      css={listStyles}
      className="model-menu__providers-list"
      sx={{ fontSize: (theme) => theme.vars.fontSizeSmall, px: iconOnly ? 0.5 : 0 }}
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
        className={`model-menu__provider-item ${selected === null && !forceUnselect ? "is-selected" : ""
          }`}
        selected={selected === null && !forceUnselect}
        onClick={handleSelectNull}
        sx={{
          py: iconOnly ? 1 : 0.25,
          justifyContent: iconOnly ? 'center' : 'flex-start',
          px: iconOnly ? 0 : 2,
          minHeight: iconOnly ? 40 : 'auto',
          borderRadius: iconOnly ? 1 : 0
        }}
      >
        {iconOnly ? (
          <Tooltip title="All providers" placement="right">
            <FormatListBulletedIcon />
          </Tooltip>
        ) : (
          <ListItemText
            primary="All providers"
            primaryTypographyProps={{
              sx: { fontSize: (theme) => theme.vars.fontSizeSmall }
            }}
          />
        )}
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
              {showDivider && !iconOnly && (
                <Divider component="li" sx={{ my: 0.5, opacity: 0.5 }} />
              )}
              <ListItemButton
                disableRipple
                className={`model-menu__provider-item ${selected === p ? "is-selected" : ""
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
                  py: iconOnly ? 1 : 0.25,
                  justifyContent: iconOnly ? 'center' : 'flex-start',
                  px: iconOnly ? 0 : 2,
                  minHeight: iconOnly ? 40 : 'auto',
                  borderRadius: iconOnly ? 1 : 0
                }}
              >
                {iconOnly ? (
                  <Tooltip title={p} placement="right">
                    <Box sx={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      bgcolor: (selected === p) ? 'primary.main' : (isProviderEnabled(p) ? 'action.selected' : 'transparent'),
                      border: `1px solid ${selected === p ? 'transparent' : theme.vars.palette.divider}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      color: (selected === p) ? 'primary.contrastText' : (isProviderEnabled(p) ? 'text.primary' : 'text.disabled'),
                    }}>
                      {formatGenericProviderName(p).substring(0, 2).toUpperCase()}
                    </Box>
                  </Tooltip>
                ) : (
                  <>
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
                        onClick={handleStopPropagation}
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
                            onClick={handleOpenSettings}
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
                      onClick={handleStopPropagation}
                    >
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
                  </>
                )}
              </ListItemButton>
            </React.Fragment>
          );
        }
      )}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem
          disabled={!menuProvider || !getProviderUrl(menuProvider)}
          onClick={handleOpenWebsite}
        >
          Open provider website
        </MenuItem>
        <MenuItem
          onClick={handleToggleProvider}
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
