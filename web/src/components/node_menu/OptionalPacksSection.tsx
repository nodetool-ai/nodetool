/** @jsxImportSource @emotion/react */
/**
 * OptionalPacksSection
 *
 * Lives at the bottom of the node-menu namespace panel. Educates the user that
 * advanced / niche nodes are tucked into optional packs to keep the menu
 * focused, and lets them reveal more nodes in one place:
 *
 *  - **Categories** are a pure menu-visibility grouping of niche namespaces
 *    that ship in the always-loaded base pack (see config/optionalNodePacks).
 *    Toggling one updates {@link useOptionalNodePacksStore}; nodes stay
 *    registered, only the browsable tree changes.
 *  - **Providers** are the first-party opt-in builtin packs (ElevenLabs,
 *    MiniMax, Topaz, …). When disabled their nodes aren't registered at all, so
 *    they never appear in the menu — this is the only in-editor place to
 *    discover and enable them. Toggling calls the server via
 *    {@link usePacksStore}, which reloads metadata so nodes appear without a
 *    restart.
 */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useCallback, useMemo, useState, type MouseEvent } from "react";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import { useShallow } from "zustand/react/shallow";

import {
  BORDER_RADIUS,
  Divider,
  FlexColumn,
  FlexRow,
  LabeledSwitch,
  MOTION,
  Popover,
  Text,
  TextLink
} from "../ui_primitives";
import { OPTIONAL_NODE_PACKS } from "../../config/optionalNodePacks";
import useOptionalNodePacksStore from "../../stores/OptionalNodePacksStore";
import usePacksStore from "../../stores/PacksStore";
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

const popoverStyles = () =>
  css({
    padding: "1em",
    "& .pack-row": {
      padding: "0.35em 0"
    }
  });

const OptionalPacksSection = () => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [pendingProviderIds, setPendingProviderIds] = useState<Set<string>>(
    () => new Set()
  );

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

  // Required packs (the base nodes) are always loaded — only opt-in provider
  // packs are toggleable here.
  const providerPacks = useMemo(
    () => builtins.filter((pack) => !pack.required),
    [builtins]
  );

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

  const handleToggleProvider = useCallback(
    async (id: string, enabled: boolean) => {
      setPendingProviderIds((prev) => new Set(prev).add(id));
      try {
        await setBuiltinEnabled(id, enabled);
      } finally {
        setPendingProviderIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [setBuiltinEnabled]
  );

  const handleManagePacks = useCallback(() => {
    window.api?.showPackageManager?.();
  }, []);

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
        <div css={popoverStyles()}>
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

            {providerPacks.length > 0 && (
              <>
                <Divider />
                <FlexColumn gap={0.25}>
                  <Text size="small" weight={600}>
                    Providers
                  </Text>
                  <Text size="small" color="secondary">
                    Enabling a provider registers its nodes instantly — no
                    restart needed.
                  </Text>
                </FlexColumn>
                <FlexColumn gap={0.25}>
                  {providerPacks.map((pack) => (
                    <div className="pack-row" key={pack.id}>
                      <LabeledSwitch
                        size="small"
                        label={pack.name}
                        description={pack.description}
                        checked={pack.enabled}
                        disabled={pendingProviderIds.has(pack.id)}
                        onChange={(checked) =>
                          void handleToggleProvider(pack.id, checked)
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
