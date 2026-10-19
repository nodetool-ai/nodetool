/** @jsxImportSource @emotion/react */
import React, { memo, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
  BORDER_RADIUS,
  SPACING,
  getSpacingPx,
  ICON_SIZE
} from "../../ui_primitives";
import useNodePacksStore from "../../../stores/NodePacksStore";
import { useShallow } from "zustand/react/shallow";
import { useOpenPackageManagerInNewTab } from "../../../hooks/useOpenPackageManager";
import {
  ONBOARDING_ENGINES,
  ONBOARDING_NODE_PACKS,
  type OnboardingEngine,
  type OnboardingNodePack
} from "./onboardingCatalog";

const EngineCard: React.FC<{ engine: OnboardingEngine }> = ({ engine }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  const statusChip = engine.separateInstallUrl ? (
    <Chip label={t("i18n-next70.engineGuide.separateApp")} compact variant="outlined" />
  ) : engine.runtimeId ? (
    <Chip label={t("i18n-next70.engineGuide.runtime")} compact variant="outlined" />
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
      <FlexColumn gap={SPACING.xs} sx={{ height: "100%" }}>
        <FlexRow gap={SPACING.xs} align="center" justify="space-between">
          <Text size="normal" weight={600}>
            {engine.name}
          </Text>
          {statusChip}
        </FlexRow>
        <Caption sx={{ color: theme.vars.palette.primary.main }}>
          {t(`i18n-next70.engineGuide.engines.${engine.id}.tagline`)}
        </Caption>
        <Caption sx={{ opacity: 0.7, lineHeight: 1.5, flex: 1 }}>
          {t(`i18n-next70.engineGuide.engines.${engine.id}.description`)}
        </Caption>
        {engine.platform && (
          <Caption sx={{ opacity: 0.55 }}>
            {t(`i18n-next70.engineGuide.engines.${engine.id}.platform`)}
          </Caption>
        )}
        <FlexRow
          gap={SPACING.micro}
          sx={{ flexWrap: "wrap", mt: SPACING.micro }}
        >
          {engine.formats.map((fmt) => (
            <Chip key={fmt} label={fmt} compact variant="outlined" />
          ))}
        </FlexRow>
        {engine.separateInstallUrl && (
          <TextLink
            href={engine.separateInstallUrl}
            external
            sx={{ mt: SPACING.micro, fontSize: "var(--fontSizeSmall)" }}
          >
            {t("i18n-next70.engineGuide.download", { name: engine.name })}{" "}
            <OpenInNewIcon fontSize="inherit" sx={{ ml: SPACING.micro }} />
          </TextLink>
        )}
        <TextLink
          href={engine.docsUrl}
          external
          sx={{ mt: SPACING.micro, fontSize: "var(--fontSizeSmall)" }}
        >
          {t("i18n-next70.engineGuide.learnMore")}{" "}
          <OpenInNewIcon fontSize="inherit" sx={{ ml: SPACING.micro }} />
        </TextLink>
      </FlexColumn>
    </Card>
  );
};

const NodePackRow: React.FC<{ pack: OnboardingNodePack }> = ({ pack }) => {
  const theme = useTheme();
  const { t } = useTranslation();
  // Select primitives only — deriving a new array inside the selector would
  // change the snapshot on every render and loop useSyncExternalStore.
  const available = useNodePacksStore((state) => state.available);
  const install = useNodePacksStore((state) => state.install);
  const isInstalled = useNodePacksStore((state) =>
    state.installed.some((p) => p.repo_id === pack.repoId)
  );
  const isBusy = useNodePacksStore((state) => state.busyIds.includes(pack.repoId));
  const openPackageManager = useOpenPackageManagerInNewTab();

  const handleInstall = useCallback(() => {
    if (available) {
      void install(pack.repoId);
    } else {
      openPackageManager();
    }
  }, [available, install, openPackageManager, pack.repoId]);

  return (
    <FlexRow
      gap={SPACING.md}
      align="center"
      justify="space-between"
      sx={{
        padding: SPACING.lg,
        borderRadius: BORDER_RADIUS.sm,
        border: `1px solid ${theme.vars.palette.divider}`,
        backgroundColor: theme.vars.palette.background.paper
      }}
    >
      <FlexColumn gap={SPACING.micro} sx={{ minWidth: 0 }}>
        <Text size="small" weight={600}>
          {pack.name}
        </Text>
        <Caption sx={{ opacity: 0.7, lineHeight: 1.4 }}>
          {t("i18n-next70.engineGuide.nodePacks.huggingFace.description")}
        </Caption>
      </FlexColumn>
      {isInstalled ? (
        <FlexRow gap={SPACING.micro} align="center" sx={{ flexShrink: 0 }}>
          <CheckCircleIcon
            sx={{ fontSize: ICON_SIZE.sm, color: theme.vars.palette.success.main }}
          />
          <Caption color="secondary">
            {t("i18n-next70.engineGuide.installed")}
          </Caption>
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
              <ExtensionOutlinedIcon />
            )
          }
          sx={{ flexShrink: 0 }}
        >
          {available
            ? t("i18n-next70.engineGuide.install")
            : t("i18n-next70.engineGuide.openManager")}
        </EditorButton>
      )}
    </FlexRow>
  );
};

const EngineGuide: React.FC = () => {
  const theme = useTheme();
  const { t } = useTranslation();
  const { available, refresh } = useNodePacksStore(
    useShallow((state) => ({
      available: state.available,
      refresh: state.refresh
    }))
  );
  const openPackageManager = useOpenPackageManagerInNewTab();

  useEffect(() => {
    if (available) {
      void refresh();
    }
  }, [available, refresh]);

  const engines = useMemo(() => ONBOARDING_ENGINES, []);

  return (
    <FlexColumn gap={SPACING.lg}>
      <FlexColumn gap={SPACING.sm}>
        <FlexColumn gap={SPACING.micro}>
          <Text size="big" weight={600}>
            {t("i18n-next70.engineGuide.localEngines")}
          </Text>
          <Caption sx={{ opacity: 0.7 }}>
            {t("i18n-next70.engineGuide.localEnginesDescription")}
          </Caption>
        </FlexColumn>
        <div
          css={{
            display: "grid",
            gap: getSpacingPx(SPACING.lg),
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))"
          }}
        >
          {engines.map((engine) => (
            <EngineCard key={engine.id} engine={engine} />
          ))}
        </div>
      </FlexColumn>

      <FlexColumn gap={SPACING.sm}>
        <FlexRow gap={SPACING.xs} align="center" justify="space-between">
          <FlexColumn gap={SPACING.micro}>
            <Text size="big" weight={600}>
              {t("i18n-next70.engineGuide.nodePacks")}
            </Text>
            <Caption sx={{ opacity: 0.7 }}>
              {available
                ? t("i18n-next70.engineGuide.nodePacksAvailableDescription")
                : t("i18n-next70.engineGuide.nodePacksUnavailableDescription")}
            </Caption>
          </FlexColumn>
          <EditorButton
            variant="text"
            density="compact"
            size="small"
            endIcon={<OpenInNewIcon />}
            onClick={openPackageManager}
          >
            {t("i18n-next70.engineGuide.packageManager")}
          </EditorButton>
        </FlexRow>
        <FlexColumn gap={SPACING.xs}>
          {ONBOARDING_NODE_PACKS.map((pack) => (
            <NodePackRow key={pack.repoId} pack={pack} />
          ))}
        </FlexColumn>
        {!available && (
          <Caption sx={{ opacity: 0.55, color: theme.vars.palette.text.secondary }}>
            {t("i18n-next70.engineGuide.browserDescription")}
          </Caption>
        )}
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(EngineGuide);
