/**
 * BlenderRenderPanel — "Render with Blender" for the 3D editor.
 *
 * Exports the scene, renders it with headless Blender at the settings below
 * (engine, samples, output size, camera, lighting, background), and lists the
 * renders. Each render is an ordinary image asset.
 */
import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import CameraEnhanceOutlinedIcon from "@mui/icons-material/CameraEnhanceOutlined";
import AspectRatioIcon from "@mui/icons-material/AspectRatio";

import ColorPicker from "../inputs/ColorPicker";
import ReportBugButton from "../support/ReportBugButton";
import {
  AlertBanner,
  Box,
  Caption,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  InspectorFieldRow,
  InspectorSection,
  InspectorSelect,
  InspectorToggleRow,
  Label,
  LoadingSpinner,
  ResponsiveImage,
  ScrollArea,
  ToggleGroup,
  ToggleOption,
  Tooltip,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useSceneBlenderRender } from "../../hooks/model3d/useSceneBlenderRender";
import { NumberRow, toOpaqueHex } from "./PropertiesPanel";
import {
  BLENDER_CAMERA_MODES,
  BLENDER_ENGINES,
  BLENDER_LIGHTING,
  BLENDER_NUMBER_BOUNDS,
  clampSetting,
  heightForAspect,
  sanitizeBlenderSettings,
  type BlenderCameraMode,
  type BlenderNumberKey,
  type BlenderRenderSettings
} from "./blenderRender";

interface BlenderRenderPanelProps {
  /**
   * The scene as a binary glTF for this render. With the `view` camera the
   * editor's viewport camera is its first camera, at `aspect`.
   */
  exportScene: (camera: BlenderCameraMode, aspect: number) => Promise<Blob>;
  /** Width over height of the viewport. */
  viewAspect: () => number;
  /** Base name of the rendered images. */
  name: string;
}

interface RenderEntry {
  id: string;
  status: "rendering" | "done" | "failed";
  assetId?: string;
  error?: string;
  caption: string;
}

const SETTINGS_KEY = "model3d.blenderRender";

/** Prefix of this panel's messages. */
const K = "i18n-cont-model-editor-11.blenderRender";

const readSettings = (): BlenderRenderSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return sanitizeBlenderSettings(raw ? JSON.parse(raw) : null);
  } catch {
    // Unreadable storage falls back to defaults.
    return sanitizeBlenderSettings(null);
  }
};

const writeSettings = (settings: BlenderRenderSettings): void => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Persistence is best-effort.
  }
};

const BlenderRenderPanel = ({ exportScene, viewAspect, name }: BlenderRenderPanelProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { render, cancel } = useSceneBlenderRender();

  const [settings, setSettings] = useState<BlenderRenderSettings>(readSettings);
  const update = useCallback((patch: Partial<BlenderRenderSettings>) => {
    setSettings((prev) => {
      const next = sanitizeBlenderSettings({ ...prev, ...patch });
      writeSettings(next);
      return next;
    });
  }, []);

  const [renders, setRenders] = useState<RenderEntry[]>([]);
  const [shownId, setShownId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleRender = useCallback(async () => {
    const aspect = settings.width / settings.height;
    let scene: Blob;
    try {
      scene = await exportScene(settings.camera, aspect);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t(`${K}.errors.export`));
      return;
    }
    const id = crypto.randomUUID();
    const caption = t(`${K}.caption`, {
      engine: t(`${K}.engines.${settings.engine}`),
      width: Math.round((settings.width * settings.resolutionPercentage) / 100),
      height: Math.round((settings.height * settings.resolutionPercentage) / 100),
      samples: settings.samples
    });
    setRenders((prev) => [{ id, status: "rendering", caption }, ...prev]);
    setShownId(id);
    try {
      const assetId = await render(id, { scene, settings, name });
      setRenders((prev) => prev.map((r) => (r.id === id ? { ...r, status: "done", assetId } : r)));
    } catch (error) {
      const message = error instanceof Error ? error.message : t(`${K}.errors.render`);
      setRenders((prev) => prev.map((r) => (r.id === id ? { ...r, status: "failed", error: message } : r)));
    }
  }, [exportScene, settings, render, name, t]);

  const shown = useMemo(
    () => renders.find((r) => r.id === shownId) ?? renders[0] ?? null,
    [renders, shownId]
  );

  const errorContext = useMemo(
    () => ({
      source: "operation-failure" as const,
      summary: t(`${K}.errors.context`),
      errorText: shown?.error
    }),
    [shown?.error, t]
  );

  const numberRow = (key: BlenderNumberKey, step = 1) => {
    const bounds = BLENDER_NUMBER_BOUNDS[key];
    return (
      <NumberRow
        label={t(`${K}.fields.${key}`)}
        value={settings[key]}
        step={step}
        integer={bounds.integer}
        // A slider is only useful on a short range; sizes and samples are typed.
        min={bounds.max - bounds.min <= 720 ? bounds.min : undefined}
        max={bounds.max - bounds.min <= 720 ? bounds.max : undefined}
        onCommit={(value) => {
          const patch: Partial<BlenderRenderSettings> = {};
          patch[key] = clampSetting(key, value);
          update(patch);
        }}
      />
    );
  };

  return (
    <ScrollArea>
      <FlexColumn gap={SPACING.md} sx={{ padding: getSpacingPx(SPACING.md) }}>
        <Box
          sx={{
            borderRadius: BORDER_RADIUS.md,
            border: `1px solid ${theme.vars.palette.divider}`,
            overflow: "hidden",
            backgroundColor: theme.vars.palette.grey[900]
          }}
        >
          {!shown ? (
            <EmptyState
              size="small"
              title={t(`${K}.emptyTitle`)}
              description={t(`${K}.emptyDescription`)}
            />
          ) : shown.status === "rendering" ? (
            <FlexColumn align="center" justify="center" gap={SPACING.sm} sx={{ aspectRatio: "16 / 9" }}>
              <LoadingSpinner />
              <Caption>{t(`${K}.rendering`)}</Caption>
              <EditorButton variant="text" density="compact" onClick={() => cancel(shown.id)}>
                {t(`${K}.cancel`)}
              </EditorButton>
            </FlexColumn>
          ) : shown.status === "failed" ? (
            <Box sx={{ padding: getSpacingPx(SPACING.sm) }}>
              <AlertBanner
                severity="error"
                compact
                action={<ReportBugButton context={errorContext} size="small" />}
              >
                {shown.error}
              </AlertBanner>
            </Box>
          ) : (
            <ResponsiveImage
              locator={`asset://${shown.assetId}`}
              alt={t(`${K}.renderAlt`, { caption: shown.caption })}
              fit="contain"
              showSkeleton
            />
          )}
        </Box>
        {shown && <Caption>{shown.caption}</Caption>}

        <InspectorSection title={t(`${K}.sections.render`)} divider={false}>
          <InspectorFieldRow label={t(`${K}.fields.engine`)}>
            <ToggleGroup
              size="small"
              exclusive
              fullWidth
              value={settings.engine}
              onChange={(_e, value) => value && update({ engine: value })}
            >
              {BLENDER_ENGINES.map((engine) => (
                <ToggleOption key={engine} value={engine} size="small">
                  <Tooltip title={t(`${K}.engineHints.${engine}`)}>
                    <span>{t(`${K}.engines.${engine}`)}</span>
                  </Tooltip>
                </ToggleOption>
              ))}
            </ToggleGroup>
          </InspectorFieldRow>
          {numberRow("samples")}
          {settings.engine === "cycles" && (
            <InspectorToggleRow
              label={t(`${K}.fields.denoise`)}
              checked={settings.denoise}
              onChange={(denoise) => update({ denoise })}
            />
          )}
        </InspectorSection>

        <InspectorSection title={t(`${K}.sections.output`)}>
          {numberRow("width")}
          {numberRow("height")}
          <FlexRow justify="flex-end">
            <EditorButton
              variant="text"
              density="compact"
              startIcon={<AspectRatioIcon />}
              onClick={() => update({ height: heightForAspect(settings.width, viewAspect()) })}
            >
              {t(`${K}.matchView`)}
            </EditorButton>
          </FlexRow>
          {numberRow("resolutionPercentage")}
          <InspectorToggleRow
            label={t(`${K}.fields.transparent`)}
            checked={settings.transparent}
            onChange={(transparent) => update({ transparent })}
          />
          {!settings.transparent && (
            <InspectorFieldRow label={t(`${K}.fields.backgroundColor`)}>
              <ColorPicker
                showCustom
                color={settings.backgroundColor}
                onColorChange={(color) => color && update({ backgroundColor: toOpaqueHex(color) })}
              />
            </InspectorFieldRow>
          )}
          <Caption>{t(`${K}.formatHint`)}</Caption>
        </InspectorSection>

        <InspectorSection title={t(`${K}.sections.camera`)}>
          <ToggleGroup
            size="small"
            exclusive
            fullWidth
            value={settings.camera}
            onChange={(_e, value) => value && update({ camera: value })}
          >
            {BLENDER_CAMERA_MODES.map((mode) => (
              <ToggleOption key={mode} value={mode} size="small">
                <Tooltip title={t(`${K}.cameraHints.${mode}`)}>
                  <span>{t(`${K}.cameras.${mode}`)}</span>
                </Tooltip>
              </ToggleOption>
            ))}
          </ToggleGroup>
          {settings.camera === "orbit" && (
            <>
              {numberRow("azimuth")}
              {numberRow("elevation")}
              {numberRow("fov")}
              {numberRow("zoom", 0.05)}
            </>
          )}
        </InspectorSection>

        <InspectorSection title={t(`${K}.sections.lighting`)}>
          <InspectorFieldRow label={t(`${K}.fields.lighting`)}>
            <InspectorSelect
              grow
              label={t(`${K}.fields.lighting`)}
              value={settings.lighting}
              options={BLENDER_LIGHTING.map((preset) => ({ value: preset, label: t(`${K}.lighting.${preset}`) }))}
              onChange={(value) => update({ lighting: value as BlenderRenderSettings["lighting"] })}
            />
          </InspectorFieldRow>
          {numberRow("lightIntensity", 0.1)}
          <Caption>{t(`${K}.lightingHint`)}</Caption>
        </InspectorSection>

        <InspectorSection title={t(`${K}.sections.advanced`)} defaultOpen={false}>
          {numberRow("timeout")}
        </InspectorSection>

        <EditorButton
          variant="contained"
          startIcon={<CameraEnhanceOutlinedIcon />}
          onClick={() => void handleRender()}
          fullWidth
        >
          {t(`${K}.render`)}
        </EditorButton>
        <Caption>{t(`${K}.requirement`)}</Caption>
        {notice && (
          <AlertBanner severity="warning" compact onClose={() => setNotice(null)}>
            {notice}
          </AlertBanner>
        )}

        {renders.length > 1 && (
          <FlexColumn gap={SPACING.xs}>
            <Label size="small">{t(`${K}.earlierRenders`)}</Label>
            <FlexRow gap={SPACING.xs} sx={{ flexWrap: "wrap" }}>
              {renders.map((entry) => (
                <Box
                  key={entry.id}
                  component="button"
                  type="button"
                  aria-label={t(`${K}.showRender`, { caption: entry.caption })}
                  aria-pressed={entry.id === shown?.id}
                  onClick={() => setShownId(entry.id)}
                  sx={{
                    width: 96,
                    padding: 0,
                    cursor: "pointer",
                    borderRadius: BORDER_RADIUS.sm,
                    overflow: "hidden",
                    backgroundColor: theme.vars.palette.grey[900],
                    border: `1px solid ${
                      entry.id === shown?.id ? theme.vars.palette.primary.main : theme.vars.palette.divider
                    }`
                  }}
                >
                  {entry.status === "done" ? (
                    <ResponsiveImage
                      locator={`asset://${entry.assetId}`}
                      alt=""
                      aspectRatio="16/9"
                      fit="cover"
                      preferThumbnail
                    />
                  ) : (
                    <FlexRow align="center" justify="center" sx={{ aspectRatio: "16 / 9" }}>
                      {entry.status === "rendering" ? (
                        <LoadingSpinner inline size={14} />
                      ) : (
                        <Caption color="error">{t(`${K}.failed`)}</Caption>
                      )}
                    </FlexRow>
                  )}
                </Box>
              ))}
            </FlexRow>
          </FlexColumn>
        )}
      </FlexColumn>
    </ScrollArea>
  );
};

export default memo(BlenderRenderPanel);
