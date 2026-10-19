/** @jsxImportSource @emotion/react */
import { useTranslation } from "react-i18next";
import { css } from "@emotion/react";
import { memo, useCallback, useMemo } from "react";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import HistoryIcon from "@mui/icons-material/History";
import {
  Text,
  Box,
  CopyButton,
  EditorButton,
  FlexRow,
  BORDER_RADIUS,
  SPACING,
  TextLink,
  getSpacingPx
} from "../ui_primitives";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { readAssetGenerationMetadata } from "@nodetool-ai/protocol";
import type { Asset } from "../../stores/ApiTypes";
import {
  formatContentType
} from "../../utils/formatUtils";
import { secondsToHMS } from "../../utils/formatDateAndTime";
import {
  openverseLicenseLabel,
  readOpenverseCredit
} from "../../utils/openverseLicense";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useOpenAssetWorkflow } from "../../hooks/useOpenAssetWorkflow";
import { useJobSnapshot } from "../../serverState/useJobSnapshot";

/** Metadata keys rendered by their own section, not by the raw dump. */
const RENDERED_METADATA_KEYS = new Set(["prompt", "generation", "openverse"]);

const formatLocalizedFileSize = (bytes: number, locale: string): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${units[index]}`;
};


const styles = (theme: Theme) =>
  css({
    width: "240px",
    padding: `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.xl)}`,
    borderLeft: `1px solid ${theme.vars.palette.grey[700]}`,
    "& .info-row": {
      display: "flex",
      gap: getSpacingPx(SPACING.md),
      padding: `${getSpacingPx(SPACING.micro)} 0`,
      alignItems: "baseline",
      lineHeight: 1.4
    },
    "& .info-label": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[400],
      flexShrink: 0,
      minWidth: "55px",
      textAlign: "right"
    },
    "& .info-value": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[100],
      wordBreak: "break-all"
    },
    "& .info-thumb": {
      width: "100%",
      maxHeight: "140px",
      objectFit: "contain",
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: getSpacingPx(SPACING.md),
      backgroundColor: theme.vars.palette.grey[800]
    },
    "& .info-section": {
      borderTop: `1px solid ${theme.vars.palette.grey[700]}`,
      marginTop: getSpacingPx(SPACING.sm),
      paddingTop: getSpacingPx(SPACING.sm)
    },
    "& .info-section-title": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[400]
    },
    "& .info-prompt": {
      fontSize: theme.fontSizeSmaller,
      color: theme.vars.palette.grey[100],
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      maxHeight: "12em",
      overflowY: "auto"
    }
  });

interface AssetInfoPanelProps {
  asset: Asset;
  /** Called after an action opened a workflow tab, so the host can close. */
  onOpenWorkflow?: () => void;
}

/** Render one setting value; arrays join, so no `[object Object]` reaches the UI. */
function formatSetting(value: string | number | boolean | Array<string | number | boolean>) {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

/** A metadata value the sections above do not own; objects stay readable. */
function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return String(value);
}

/** `negative_prompt` → `Negative prompt`. */
function settingLabel(key: string) {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const AssetInfoPanel: React.FC<AssetInfoPanelProps> = ({
  asset,
  onOpenWorkflow
}) => {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const currentFolder = useAssetGridStore((state) => state.currentFolder);
  const getWorkflow = useWorkflowManager((state) => state.getWorkflow);
  const { openWorkflow, openSnapshot } = useOpenAssetWorkflow();
  // Older and headless runs may have no job row or no stored graph; the
  // "as it was" action only shows when there is a graph to open.
  const { data: snapshot } = useJobSnapshot(asset.job_id);
  const runGraphSnapshot = snapshot?.graph ? snapshot : null;

  const handleOpenWorkflow = useCallback(() => {
    void openWorkflow(asset);
    onOpenWorkflow?.();
  }, [asset, onOpenWorkflow, openWorkflow]);

  const handleOpenSnapshot = useCallback(() => {
    if (!runGraphSnapshot) {
      return;
    }
    void openSnapshot(asset, runGraphSnapshot);
    onOpenWorkflow?.();
  }, [asset, onOpenWorkflow, openSnapshot, runGraphSnapshot]);

  const folderName = useMemo(() => {
    if (!asset.parent_id) {
      return null;
    }
    if (currentFolder && currentFolder.id === asset.parent_id) {
      return currentFolder.name;
    }
    return asset.parent_id;
  }, [asset.parent_id, currentFolder]);

  const workflowName = useMemo(() => {
    if (!asset.workflow_id) {
      return null;
    }
    const wf = getWorkflow(asset.workflow_id);
    return wf?.name || asset.workflow_id;
  }, [asset.workflow_id, getWorkflow]);

  const isImage = asset.content_type?.startsWith("image/");
  const thumbSrc = asset.thumb_url || (isImage ? asset.get_url : null);
  const metadata = asset.metadata;

  // The prompt and settings the asset was generated with — kept on the asset so
  // the same recipe is at hand when someone wants another variant of it.
  const { prompt, generation } = useMemo(
    () => readAssetGenerationMetadata(metadata),
    [metadata]
  );
  const settings = generation?.params;
  const credit = useMemo(() => readOpenverseCredit(metadata), [metadata]);
  const otherMetadata = useMemo(
    () =>
      Object.entries(metadata ?? {}).filter(
        ([key]) => !RENDERED_METADATA_KEYS.has(key)
      ),
    [metadata]
  );

  return (
    <Box css={styles(theme)}>
      {thumbSrc && (
        <img className="info-thumb" src={thumbSrc} alt="" loading="eager" />
      )}

      <InfoRow label={t("screen_editor.name")} value={asset.name} />
      <InfoRow
        label={t("screen_editor.type")}
        value={asset.content_type ? formatContentType(asset.content_type) : null}
      />
      {asset.size != null && asset.size > 0 && (
        <InfoRow label={t("screen_editor.size")} value={formatLocalizedFileSize(asset.size, i18n.language)} />
      )}
      {asset.duration != null && asset.duration > 0 && (
        <InfoRow label={t("screen_editor.duration")} value={secondsToHMS(asset.duration)} />
      )}
      <InfoRow
        label={t("screen_editor.created")}
        value={Number.isNaN(new Date(asset.created_at).getTime()) ? "—" : new Intl.DateTimeFormat(i18n.language, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }).format(new Date(asset.created_at))}
      />

      {(folderName || workflowName || runGraphSnapshot) && (
        <div className="info-section">
          {folderName && <InfoRow label={t("screen_editor.folder")} value={folderName} />}
          {workflowName && <InfoRow label={t("screen_editor.workflow")} value={workflowName} />}
          {(asset.workflow_id || runGraphSnapshot) && (
            <FlexRow gap={SPACING.xs} wrap sx={{ pt: SPACING.xs }}>
              {asset.workflow_id && (
                <EditorButton
                  variant="outlined"
                  startIcon={<AccountTreeIcon />}
                  onClick={handleOpenWorkflow}
                  tooltip={t("screen_editor.openSourceWorkflowTooltip")}
                >
                  {t("screen_editor.openWorkflow")}
                </EditorButton>
              )}
              {runGraphSnapshot && (
                <EditorButton
                  variant="outlined"
                  startIcon={<HistoryIcon />}
                  onClick={handleOpenSnapshot}
                  tooltip={t("screen_editor.openSnapshotTooltip")}
                >
                  {t("screen_editor.openAsMade")}
                </EditorButton>
              )}
            </FlexRow>
          )}
        </div>
      )}

      {prompt && (
        <div className="info-section">
          <FlexRow align="center" justify="space-between">
            <Text className="info-section-title" component="span">
              {t("screen_editor.prompt")}
            </Text>
            <CopyButton value={prompt} tooltip={t("screen_editor.copyPrompt")} buttonSize="small" />
          </FlexRow>
          <Text className="info-prompt" component="p">
            {prompt}
          </Text>
        </div>
      )}

      {credit && (
        <div className="info-section">
          <FlexRow align="center" justify="space-between">
            <Text className="info-section-title" component="span">
              {t("screen_editor.license")}
            </Text>
            {credit.attribution && (
              <CopyButton
                value={credit.attribution}
                tooltip={t("screen_editor.copyAttribution")}
                buttonSize="small"
              />
            )}
          </FlexRow>
          <div className="info-row">
            <Text className="info-label" component="span">
              {t("screen_editor.license")}
            </Text>
            <Text className="info-value" component="span">
              {credit.license_url ? (
                <TextLink href={credit.license_url} external>
                  {openverseLicenseLabel(credit)}
                </TextLink>
              ) : (
                openverseLicenseLabel(credit)
              )}
            </Text>
          </div>
          <InfoRow label={t("screen_editor.creator")} value={credit.creator} />
          {credit.landing_url && (
            <div className="info-row">
              <Text className="info-label" component="span">
                {t("screen_editor.source")}
              </Text>
              <Text className="info-value" component="span">
                <TextLink href={credit.landing_url} external>
                  {credit.source || t("screen_editor.originalPage")}
                </TextLink>
              </Text>
            </div>
          )}
          {credit.attribution && (
            <Text className="info-prompt" component="p">
              {credit.attribution}
            </Text>
          )}
        </div>
      )}

      {generation && (
        <div className="info-section">
          <InfoRow label={t("screen_editor.model")} value={generation.model_name ?? generation.model} />
          <InfoRow label={t("screen_editor.provider")} value={generation.provider} />
          <InfoRow label={t("screen_editor.node")} value={generation.node_type} />
          <InfoRow label={t("screen_editor.task")} value={generation.capability} />
          {settings &&
            Object.entries(settings).map(([key, value]) => (
              <InfoRow
                key={key}
                label={settingLabel(key)}
                value={formatSetting(value)}
              />
            ))}
        </div>
      )}

      <div className="info-section">
        <InfoRow label={t("screen_editor.id")} value={asset.id} />
      </div>

      {otherMetadata.length > 0 && (
        <div className="info-section">
          {otherMetadata.map(([key, val]) => (
            <InfoRow key={key} label={key} value={formatMetadataValue(val)} />
          ))}
        </div>
      )}
    </Box>
  );
};

const InfoRow = memo(function InfoRow({
  label,
  value
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) {
    return null;
  }
  return (
    <div className="info-row">
      <Text className="info-label" component="span">
        {label}
      </Text>
      <Text className="info-value" component="span">
        {value}
      </Text>
    </div>
  );
});

export default memo(AssetInfoPanel);
