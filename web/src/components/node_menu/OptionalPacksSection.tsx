/** @jsxImportSource @emotion/react */
/**
 * OptionalPacksSection
 *
 * Lives at the bottom of the node-menu namespace panel. Educates the user that
 * nodes are organized into optional packs to keep the menu focused, and gathers
 * the ways to reveal more nodes in one place:
 *
 *  - **Categories** are a pure menu-visibility grouping of niche namespaces
 *    that ship in the always-loaded base pack (see config/optionalNodePacks).
 *    Toggling one updates {@link useOptionalNodePacksStore}; nodes stay
 *    registered, only the browsable tree changes.
 *  - **Providers** are the first-party provider packs. The API key is the
 *    source of truth: a keyed provider's nodes appear once its key is set
 *    (setting the key enables the pack automatically — see
 *    useAutoEnableNodePacks). Keyless local packs (Transformers.js, Hugging
 *    Face) keep a manual toggle.
 */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState, type MouseEvent } from "react";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";

import {
  BORDER_RADIUS,
  Divider,
  FlexColumn,
  FlexRow,
  LabeledSwitch,
  MOTION,
  Text,
  TextLink,
  Popover
} from "../ui_primitives";
import { OPTIONAL_NODE_PACKS } from "../../config/optionalNodePacks";
import useOptionalNodePacksStore from "../../stores/OptionalNodePacksStore";
import usePacksStore from "../../stores/PacksStore";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import { useSecrets } from "../../hooks/useSecrets";
import { getRequiredKeyForBuiltinPack } from "../../utils/providerPacks";
import { getSecretDisplayName } from "../../utils/nodeProvider";
import { isElectron } from "../../lib/env";

const styles = (theme: Theme) =>
  css({
    "&": {
      marginTop: "0.5em",
      paddingTop: "0.5em",
      borderTop: `1px solid ${theme.vars.palette.divider}`
    },
    ".optional-packs-trigger": {
      display: "flex",
      alignItems: "center",
      gap: "0.6em",
      width: "100%",
      cursor: "pointer",
      padding: "0.45em 0.5em",
      border: "none",
      background: "transparent",
      borderRadius: BORDER_RADIUS.md,
      color: theme.vars.palette.text.secondary,
      fontFamily: theme.fontFamily1,
      fontSize: theme.fontSizeSmall,
      textAlign: "left",
      transition: MOTION.background,
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover,
        color: theme.vars.palette.text.primary
      }
    },
    ".optional-packs-trigger .label": {
      flex: 1,
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".optional-packs-trigger .count": {
      flexShrink: 0,
      fontSize: theme.fontSizeSmaller,
      fontWeight: 600,
      color: "var(--palette-primary-main)"
    },
    ".optional-packs-trigger .icon": {
      flexShrink: 0,
      fontSize: "1.1em",
      color: "inherit"
    }
  });

const popoverStyles = (theme: Theme) =>
  css({
    padding: "1em",
    "& .pack-row": {
      padding: "0.35em 0"
    },
    "& .provider-row .provider-name": {
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    "& .provider-row .key-set": {
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      gap: "0.3em",
      color: theme.vars.palette.success.main
    },
    "& .provider-row .key-set svg": {
      fontSize: "1em"
    }
  });

const OptionalPacksSection = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [pendingPackIds, setPendingPackIds] = useState<Set<string>>(
    () => new Set()
  );

  const { isApiKeySet } = useSecrets();
  const closeNodeMenu = useNodeMenuStore((state) => state.closeNodeMenu);

  const { enabledPackIds, setPackEnabled, enableAll, disableAll } =
    useOptionalNodePacksStore(
      useShallow((state) => ({
        enabledPackIds: state.enabledPackIds,
        setPackEnabled: state.setPackEnabled,
        enableAll: state.enableAll,
        disableAll: state.disableAll
      }))
    );

  const { builtins, fetchBuiltins, setBuiltinEnabled } = usePacksStore(
    useShallow((state) => ({
      builtins: state.builtins,
      fetchBuiltins: state.fetchBuiltins,
      setBuiltinEnabled: state.setBuiltinEnabled
    }))
  );

  // Required packs (the base nodes) are always loaded; split the rest into
  // key-gated providers (the key is the switch) and keyless local packs (a
  // manual toggle is the only way to turn them on).
  const { keyedProviders, localPacks } = useMemo(() => {
    const keyed: { id: string; name: string; requiredKey: string }[] = [];
    const local: typeof builtins = [];
    for (const pack of builtins) {
      if (pack.required) continue;
      const requiredKey = getRequiredKeyForBuiltinPack(pack.id);
      if (requiredKey) {
        keyed.push({ id: pack.id, name: pack.name, requiredKey });
      } else {
        local.push(pack);
      }
    }
    return { keyedProviders: keyed, localPacks: local };
  }, [builtins]);

  const enabledCount = enabledPackIds.length;
  const total = OPTIONAL_NODE_PACKS.length;

  const handleOpen = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      setAnchorEl(e.currentTarget);
      // Lazily load the builtin pack list the first time the panel opens (and
      // retry while empty, e.g. if the server wasn't reachable yet).
      if (builtins.length === 0) void fetchBuiltins();
    },
    [builtins.length, fetchBuiltins]
  );
  const handleClose = useCallback(() => setAnchorEl(null), []);

  const handleToggleLocalPack = useCallback(
    async (id: string, enabled: boolean) => {
      setPendingPackIds((prev) => new Set(prev).add(id));
      try {
        await setBuiltinEnabled(id, enabled);
      } finally {
        setPendingPackIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [setBuiltinEnabled]
  );

  const openApiKeys = useCallback(() => {
    setAnchorEl(null);
    closeNodeMenu();
    navigate("/settings?tab=1");
  }, [navigate, closeNodeMenu]);

  const handleManagePacks = useCallback(() => {
    setAnchorEl(null);
    closeNodeMenu();
    navigate("/packages");
  }, [navigate, closeNodeMenu]);

  return (
    <div css={styles(theme)} className="optional-packs-section">
      <button
        type="button"
        className="optional-packs-trigger"
        onClick={handleOpen}
        title="Reveal advanced and niche node packs"
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchorEl)}
      >
        <Inventory2OutlinedIcon className="icon" />
        <span className="label">Optional packs</span>
        <span className="count">
          {enabledCount > 0 ? `${enabledCount}/${total}` : `+${total}`}
        </span>
      </button>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={handleClose}
        placement="top-left"
        maxWidth={340}
        maxHeight="70vh"
      >
        <div css={popoverStyles(theme)}>
          <FlexColumn gap={1}>
            <Text size="normal" weight={600}>
              Optional node packs
            </Text>
            <Text size="small" color="secondary">
              Advanced and niche nodes are tucked into optional packs to keep
              this menu focused. Turn on what you need — they appear in the list
              right away. Search always finds every node, even when its pack is
              off.
            </Text>

            <Divider />

            <FlexRow align="center" justify="space-between">
              <Text size="small" weight={600}>
                Categories
              </Text>
              <FlexRow gap={1.5} align="center">
                <TextLink asButton onClick={() => enableAll()}>
                  Show all
                </TextLink>
                <TextLink asButton onClick={() => disableAll()}>
                  Hide all
                </TextLink>
              </FlexRow>
            </FlexRow>

            <FlexColumn gap={0.25}>
              {OPTIONAL_NODE_PACKS.map((pack) => (
                <div className="pack-row" key={pack.id}>
                  <LabeledSwitch
                    size="small"
                    label={pack.label}
                    description={pack.description}
                    checked={enabledPackIds.includes(pack.id)}
                    onChange={(checked) => setPackEnabled(pack.id, checked)}
                  />
                </div>
              ))}
            </FlexColumn>

            {keyedProviders.length > 0 && (
              <>
                <Divider />
                <FlexColumn gap={0.25}>
                  <Text size="small" weight={600}>
                    Providers
                  </Text>
                  <Text size="small" color="secondary">
                    Provider nodes appear once you add their API key — setting a
                    key enables the pack automatically.
                  </Text>
                </FlexColumn>
                <FlexColumn gap={0.25}>
                  {keyedProviders.map((provider) => {
                    const hasKey = isApiKeySet(provider.requiredKey);
                    return (
                      <FlexRow
                        key={provider.id}
                        className="provider-row pack-row"
                        align="center"
                        justify="space-between"
                        gap={1}
                      >
                        <Text size="small" className="provider-name">
                          {provider.name}
                        </Text>
                        {hasKey ? (
                          <span className="key-set">
                            <CheckCircleOutlineIcon />
                            <Text size="small" color="inherit">
                              Key set
                            </Text>
                          </span>
                        ) : (
                          <TextLink
                            asButton
                            onClick={openApiKeys}
                            title={`Add ${getSecretDisplayName(
                              provider.requiredKey
                            )}`}
                          >
                            Add API key
                          </TextLink>
                        )}
                      </FlexRow>
                    );
                  })}
                </FlexColumn>
              </>
            )}

            {localPacks.length > 0 && (
              <>
                <Divider />
                <FlexColumn gap={0.25}>
                  <Text size="small" weight={600}>
                    Local packs
                  </Text>
                  <Text size="small" color="secondary">
                    Run locally — no API key required.
                  </Text>
                </FlexColumn>
                <FlexColumn gap={0.25}>
                  {localPacks.map((pack) => (
                    <div className="pack-row" key={pack.id}>
                      <LabeledSwitch
                        size="small"
                        label={pack.name}
                        description={pack.description}
                        checked={pack.enabled}
                        disabled={pendingPackIds.has(pack.id)}
                        onChange={(checked) =>
                          void handleToggleLocalPack(pack.id, checked)
                        }
                      />
                    </div>
                  ))}
                </FlexColumn>
              </>
            )}

            {isElectron && (
              <>
                <Divider />
                <FlexRow justify="flex-end">
                  <TextLink asButton onClick={handleManagePacks}>
                    More packs…
                  </TextLink>
                </FlexRow>
              </>
            )}
          </FlexColumn>
        </div>
      </Popover>
    </div>
  );
};

export default memo(OptionalPacksSection);
