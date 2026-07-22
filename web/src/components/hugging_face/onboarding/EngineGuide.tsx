/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import {
  Card,
  Caption,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Text,
  TextLink,
  BORDER_RADIUS
} from "../../ui_primitives";
import useNodePacksStore from "../../../stores/NodePacksStore";
import { useShallow } from "zustand/react/shallow";
import { useOpenPackageManager } from "../../../hooks/useOpenPackageManager";
import {
  ONBOARDING_ENGINES,
  ONBOARDING_NODE_PACKS,
  type OnboardingEngine,
  type OnboardingNodePack
} from "./onboardingCatalog";

const EngineCard: React.FC<{ engine: OnboardingEngine }> = ({ engine }) => {
  const theme = useTheme();
  const statusChip = engine.bundled ? (
    <Chip label="Bundled" compact color="success" variant="outlined" />
  ) : engine.runtimeId ? (
    <Chip label="Runtime" compact variant="outlined" />
  ) : null;

  return (
    <Card
      variant="outlined"
      padding="normal"
      sx={{
        borderRadius: BORDER_RADIUS.md,
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper,
        height: "100%"
      }}
    >
      <FlexColumn gap={1} sx={{ height: "100%" }}>
        <FlexRow gap={1} align="center" justify="space-between">
          <Text size="normal" weight={600}>
            {engine.name}
          </Text>
          {statusChip}
        </FlexRow>
        <Caption sx={{ color: theme.vars.palette.primary.main }}>
          {engine.tagline}
        </Caption>
        <Caption sx={{ opacity: 0.7, lineHeight: 1.5, flex: 1 }}>
          {engine.description}
        </Caption>
        {engine.platform && (
          <Caption sx={{ opacity: 0.55 }}>{engine.platform}</Caption>
        )}
        <FlexRow gap={0.5} sx={{ flexWrap: "wrap", mt: 0.5 }}>
          {engine.formats.map((fmt) => (
            <Chip key={fmt} label={fmt} compact variant="outlined" />
          ))}
        </FlexRow>
        <TextLink
          href={engine.docsUrl}
          external
          sx={{ mt: 0.5, fontSize: "var(--fontSizeSmall)" }}
        >
          Learn more <OpenInNewIcon sx={{ fontSize: 12, ml: 0.25 }} />
        </TextLink>
      </FlexColumn>
    </Card>
  );
};

const NodePackRow: React.FC<{ pack: OnboardingNodePack }> = ({ pack }) => {
  const theme = useTheme();
  // Select primitives only — deriving a new array inside the selector would
  // change the snapshot on every render and loop useSyncExternalStore.
  const available = useNodePacksStore((state) => state.available);
  const install = useNodePacksStore((state) => state.install);
  const isInstalled = useNodePacksStore((state) =>
    state.installed.some((p) => p.repo_id === pack.repoId)
  );
  const isBusy = useNodePacksStore((state) => state.busyIds.includes(pack.repoId));
  const openPackageManager = useOpenPackageManager();

  const handleInstall = useCallback(() => {
    if (available) {
      void install(pack.repoId);
    } else {
      openPackageManager();
    }
  }, [available, install, openPackageManager, pack.repoId]);

  return (
    <FlexRow
      gap={2}
      align="center"
      justify="space-between"
      sx={{
        padding: "0.65rem 0.85rem",
        borderRadius: BORDER_RADIUS.sm,
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper
      }}
    >
      <FlexColumn gap={0.25} sx={{ minWidth: 0 }}>
        <Text size="small" weight={600}>
          {pack.name}
        </Text>
        <Caption sx={{ opacity: 0.7, lineHeight: 1.4 }}>
          {pack.description}
        </Caption>
      </FlexColumn>
      {isInstalled ? (
        <FlexRow gap={0.5} align="center" sx={{ flexShrink: 0 }}>
          <CheckCircleIcon
            sx={{ fontSize: 16, color: theme.vars.palette.success.main }}
          />
          <Caption color="secondary">Installed</Caption>
        </FlexRow>
      ) : (
        <EditorButton
          variant="outlined"
          density="compact"
          size="small"
          disabled={isBusy}
          onClick={handleInstall}
          startIcon={
            isBusy ? (
              <LoadingSpinner inline size={14} />
            ) : (
              <ExtensionOutlinedIcon sx={{ fontSize: 15 }} />
            )
          }
          sx={{ flexShrink: 0 }}
        >
          {available ? "Install" : "Open Manager"}
        </EditorButton>
      )}
    </FlexRow>
  );
};

const EngineGuide: React.FC = () => {
  const theme = useTheme();
  const { available, refresh } = useNodePacksStore(
    useShallow((state) => ({
      available: state.available,
      refresh: state.refresh
    }))
  );
  const openPackageManager = useOpenPackageManager();

  useEffect(() => {
    if (available) {
      void refresh();
    }
  }, [available, refresh]);

  const engines = useMemo(() => ONBOARDING_ENGINES, []);

  return (
    <FlexColumn gap={3}>
      <FlexColumn gap={1.5}>
        <FlexColumn gap={0.25}>
          <Text size="big" weight={600}>
            Local engines
          </Text>
          <Caption sx={{ opacity: 0.7 }}>
            NodeTool runs models through these engines. Ollama is the easiest
            start; the others unlock more model types.
          </Caption>
        </FlexColumn>
        <div
          css={{
            display: "grid",
            gap: "0.75rem",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))"
          }}
        >
          {engines.map((engine) => (
            <EngineCard key={engine.id} engine={engine} />
          ))}
        </div>
      </FlexColumn>

      <FlexColumn gap={1.5}>
        <FlexRow gap={1} align="center" justify="space-between">
          <FlexColumn gap={0.25}>
            <Text size="big" weight={600}>
              Node packs
            </Text>
            <Caption sx={{ opacity: 0.7 }}>
              {available
                ? "Install the packs that add the nodes you want to use."
                : "Node packs install from the desktop app's Package Manager."}
            </Caption>
          </FlexColumn>
          <EditorButton
            variant="text"
            density="compact"
            size="small"
            endIcon={<OpenInNewIcon sx={{ fontSize: 13 }} />}
            onClick={openPackageManager}
          >
            Package Manager
          </EditorButton>
        </FlexRow>
        <FlexColumn gap={1}>
          {ONBOARDING_NODE_PACKS.map((pack) => (
            <NodePackRow key={pack.repoId} pack={pack} />
          ))}
        </FlexColumn>
        {!available && (
          <Caption sx={{ opacity: 0.55, color: theme.vars.palette.text.secondary }}>
            Running in the browser? Model downloads still work here — node packs
            and runtimes are managed in the desktop app.
          </Caption>
        )}
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(EngineGuide);
