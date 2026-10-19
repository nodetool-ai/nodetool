/**
 * AiRenderPanel — "Render this view" for the 3D editor.
 *
 * Captures the viewport (shaded, depth or normals), sends it to an
 * image-edit model with the creator's brief and optional style references,
 * and lists the renders. Each render is an ordinary image asset, so it can be
 * reused as the style reference of the next one to keep a look consistent.
 */
import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import ImageIcon from "@mui/icons-material/Image";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import CloseIcon from "@mui/icons-material/CloseOutlined";

import type { Asset, ImageModel } from "../../stores/ApiTypes";
import { useAssetStore } from "../../stores/AssetStore";
import MediaControlChip from "../chat/composer/MediaControlChip";
import ImageModelMenuDialog from "../model_menu/ImageModelMenuDialog";
import { imageModelConstraints, clampToAllowed } from "../chat/composer/imageModelOptions";
import ReportBugButton from "../support/ReportBugButton";
import {
  AlertBanner,
  Box,
  Caption,
  DropZone,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  ResponsiveImage,
  ScrollArea,
  TextArea,
  ToggleGroup,
  ToggleOption,
  ToolbarIconButton,
  Tooltip,
  UploadButton,
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useMediaOptions } from "../../hooks/useModelsByProvider";
import { useSceneAiRender } from "../../hooks/model3d/useSceneAiRender";
import { deserializeDragData, DRAG_DATA_MIME } from "../../lib/dragdrop/serialization";
import { deriveImageSizePreset } from "../../stores/MediaGenerationStore";
import { CAPTURE_PASSES, type CapturePass } from "./aiRender";

/** A viewport capture and the pixel size it was drawn at. */
export interface ViewportCapture {
  image: string;
  width: number;
  height: number;
}

interface AiRenderPanelProps {
  /** Render the viewport without editor helpers. Throws when it is not ready. */
  capture: (pass: CapturePass) => ViewportCapture;
}

interface StyleReference {
  assetId: string;
  name: string;
}

interface RenderEntry {
  id: string;
  status: "rendering" | "done" | "failed";
  assetId?: string;
  error?: string;
  caption: string;
}

/** Image-edit models take only a few input images; most read at most four. */
const MAX_REFERENCES = 3;

const SETTINGS_KEY = "model3d.aiRender";

interface StoredSettings {
  provider: string;
  model: string;
  modelName: string;
  pass: CapturePass;
}

const readSettings = (): StoredSettings => {
  const fallback: StoredSettings = { provider: "", model: "", modelName: "", pass: "shaded" };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return { ...fallback, ...(parsed as Partial<StoredSettings>) };
    }
  } catch {
    // Unreadable storage falls back to defaults.
  }
  return fallback;
};

const writeSettings = (settings: StoredSettings): void => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Persistence is best-effort.
  }
};

const isImageAsset = (asset: Pick<Asset, "content_type">): boolean =>
  asset.content_type.startsWith("image/");

const AiRenderPanel = ({ capture }: AiRenderPanelProps) => {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { render } = useSceneAiRender();

  const [settings, setSettings] = useState<StoredSettings>(readSettings);
  const updateSettings = useCallback((patch: Partial<StoredSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeSettings(next);
      return next;
    });
  }, []);

  const [prompt, setPrompt] = useState("");
  const [references, setReferences] = useState<StyleReference[]>([]);
  const [renders, setRenders] = useState<RenderEntry[]>([]);
  const [shownId, setShownId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [pickedConstraints, setPickedConstraints] = useState<{
    aspectRatios?: string[];
    resolutions?: string[];
  } | null>(null);
  const modelAnchorRef = useRef<HTMLButtonElement>(null);

  // A remembered model carries only ids, so its size constraints come from
  // the server until the creator picks a model through the dialog.
  const mediaOptions = useMediaOptions({
    provider: settings.provider,
    model: settings.model,
    task: "image"
  });
  const constraints = pickedConstraints ?? {
    aspectRatios: mediaOptions.data?.aspectRatios,
    resolutions: mediaOptions.data?.resolutions
  };

  const handlePickModel = useCallback(
    (model: ImageModel) => {
      updateSettings({ provider: model.provider, model: model.id, modelName: model.name || model.id });
      setPickedConstraints(imageModelConstraints(model));
      setModelMenuOpen(false);
    },
    [updateSettings]
  );

  const addReference = useCallback((reference: StyleReference) => {
    setReferences((prev) => {
      if (prev.some((r) => r.assetId === reference.assetId)) {
        return prev;
      }
      if (prev.length >= MAX_REFERENCES) {
        setNotice(t("i18n-cont-model-editor-11.aiRender.maxReferences", { count: MAX_REFERENCES }));
        return prev;
      }
      return [...prev, reference];
    });
  }, [t]);

  const handleUpload = useCallback(
    async (files: File[]) => {
      for (const file of files.filter((f) => f.type.startsWith("image/"))) {
        try {
          const asset = await useAssetStore.getState().createAsset(file, undefined, undefined, undefined, "file");
          addReference({ assetId: asset.id, name: asset.name });
        } catch (error) {
          setNotice(error instanceof Error ? error.message : t("i18n-cont-model-editor-11.aiRender.errors.upload"));
        }
      }
    },
    [addReference, t]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_DATA_MIME) || e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      // The viewport behind this panel imports dropped models.
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setDropActive(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDropActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDropActive(false);
      const dragData = deserializeDragData(e.dataTransfer);
      if (dragData?.type === "asset") {
        const asset = dragData.payload;
        if (!isImageAsset(asset)) {
          setNotice(t("i18n-cont-model-editor-11.aiRender.errors.notImage", { name: asset.name }));
          return;
        }
        addReference({ assetId: asset.id, name: asset.name });
        return;
      }
      if (e.dataTransfer.files.length > 0) {
        void handleUpload(Array.from(e.dataTransfer.files));
      }
    },
    [addReference, handleUpload, t]
  );

  const passLabel = t(`i18n-cont-model-editor-11.aiRender.passes.${settings.pass}.label`);

  const handleRender = useCallback(async () => {
    let view: ViewportCapture;
    try {
      view = capture(settings.pass);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("i18n-cont-model-editor-11.aiRender.errors.capture"));
      return;
    }
    const size = deriveImageSizePreset(view.width, view.height);
    const id = crypto.randomUUID();
    const captionParts = [settings.modelName || settings.model, t("i18n-cont-model-editor-11.aiRender.viewCaption", { pass: passLabel })];
    if (references.length > 0) {
      captionParts.push(t("i18n-cont-model-editor-11.aiRender.referenceCount", { count: references.length, formattedCount: new Intl.NumberFormat(i18n.language).format(references.length) }));
    }
    const entry: RenderEntry = { id, status: "rendering", caption: captionParts.join(" · ") };
    setRenders((prev) => [entry, ...prev]);
    setShownId(id);
    try {
      const assetId = await render({
        capture: view.image,
        pass: settings.pass,
        prompt,
        provider: settings.provider,
        model: settings.model,
        referenceAssetIds: references.map((r) => r.assetId),
        aspectRatio: clampToAllowed(size.aspectRatio, constraints.aspectRatios),
        resolution: clampToAllowed(size.resolution === "4K" ? "2K" : size.resolution, constraints.resolutions)
      });
      setRenders((prev) => prev.map((r) => (r.id === id ? { ...r, status: "done", assetId } : r)));
    } catch (error) {
      const message = error instanceof Error ? error.message : t("i18n-cont-model-editor-11.aiRender.errors.render");
      setRenders((prev) => prev.map((r) => (r.id === id ? { ...r, status: "failed", error: message } : r)));
    }
  }, [capture, settings, passLabel, references, render, prompt, constraints, t, i18n.language]);

  const shown = useMemo(
    () => renders.find((r) => r.id === shownId) ?? renders[0] ?? null,
    [renders, shownId]
  );
  const rendering = renders.some((r) => r.status === "rendering");
  const canRender = Boolean(settings.model && settings.provider);

  const errorContext = useMemo(
    () => ({
      source: "operation-failure" as const,
      summary: t("i18n-cont-model-editor-11.aiRender.errors.context"),
      errorText: shown?.error
    }),
    [shown?.error, t]
  );

  return (
    <ScrollArea>
      <DropZone
        overlay
        over={dropActive}
        overlayLabel={t("i18n-cont-model-editor-11.aiRender.dropReference")}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
      <FlexColumn
        gap={SPACING.md}
        sx={{ padding: getSpacingPx(SPACING.md) }}
      >
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
              title={t("i18n-cont-model-editor-11.aiRender.emptyTitle")}
              description={t("i18n-cont-model-editor-11.aiRender.emptyDescription")}
            />
          ) : shown.status === "rendering" ? (
            <FlexColumn align="center" justify="center" gap={SPACING.sm} sx={{ aspectRatio: "16 / 9" }}>
              <LoadingSpinner />
              <Caption>{t("i18n-cont-model-editor-11.aiRender.rendering")}</Caption>
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
              alt={t("i18n-cont-model-editor-11.aiRender.renderAlt", { caption: shown.caption })}
              fit="contain"
              showSkeleton
            />
          )}
        </Box>
        {shown && <Caption>{shown.caption}</Caption>}
        {shown?.status === "done" && shown.assetId && (
          <EditorButton
            variant="outlined"
            density="compact"
            startIcon={<PaletteOutlinedIcon />}
            disabled={references.some((r) => r.assetId === shown.assetId)}
            onClick={() => addReference({ assetId: shown.assetId as string, name: shown.caption })}
          >
            {t("i18n-cont-model-editor-11.aiRender.useRenderReference")}
          </EditorButton>
        )}

        <TextArea
          value={prompt}
          onChange={(value) => setPrompt(value)}
          placeholder={t("i18n-cont-model-editor-11.aiRender.promptPlaceholder")}
          minRows={2}
          maxRows={6}
          fullWidth
          inputProps={{ "aria-label": t("i18n-cont-model-editor-11.aiRender.promptLabel") }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              canRender &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void handleRender();
            }
          }}
        />

        <FlexColumn gap={SPACING.xs}>
          <Label size="small">{t("i18n-cont-model-editor-11.aiRender.model")}</Label>
          <MediaControlChip
            ref={modelAnchorRef}
            icon={<ImageIcon fontSize="small" />}
            label={settings.modelName || settings.model || t("i18n-cont-model-editor-11.aiRender.selectModel")}
            active={modelMenuOpen}
            onClick={() => setModelMenuOpen(true)}
            truncate
            grow
            maxWidth={320}
          />
          {modelMenuOpen && (
            <ImageModelMenuDialog
              open
              anchorEl={modelAnchorRef.current}
              onClose={() => setModelMenuOpen(false)}
              onModelChange={handlePickModel}
              task={["image_to_image", "image_edit"]}
            />
          )}
        </FlexColumn>

        <FlexColumn gap={SPACING.xs}>
          <Label size="small">{t("i18n-cont-model-editor-11.aiRender.sendModel")}</Label>
          <ToggleGroup
            size="small"
            exclusive
            fullWidth
            value={settings.pass}
            onChange={(_e, value) => value && updateSettings({ pass: value as CapturePass })}
          >
            {CAPTURE_PASSES.map((pass) => (
              <ToggleOption key={pass.id} value={pass.id} size="small" aria-label={t("i18n-cont-model-editor-11.aiRender.passView", { pass: t(`i18n-cont-model-editor-11.aiRender.passes.${pass.id}.label`) })}>
                <Tooltip title={t(`i18n-cont-model-editor-11.aiRender.passes.${pass.id}.hint`)}>
                  <span>{t(`i18n-cont-model-editor-11.aiRender.passes.${pass.id}.label`)}</span>
                </Tooltip>
              </ToggleOption>
            ))}
          </ToggleGroup>
        </FlexColumn>

        <FlexColumn gap={SPACING.xs}>
          <FlexRow align="center" justify="space-between">
            <Label size="small">{t("i18n-cont-model-editor-11.aiRender.references")}</Label>
            <UploadButton
              onFileSelect={(files) => void handleUpload(files)}
              tooltip={t("i18n-cont-model-editor-11.aiRender.uploadReference")}
              accept="image/*"
              disabled={references.length >= MAX_REFERENCES}
            />
          </FlexRow>
          {references.length === 0 ? (
            <Box
              sx={{
                padding: getSpacingPx(SPACING.sm),
                borderRadius: BORDER_RADIUS.sm,
                border: `1px dashed ${theme.vars.palette.divider}`
              }}
            >
              <Caption>{t("i18n-cont-model-editor-11.aiRender.referenceHint")}</Caption>
            </Box>
          ) : (
            <FlexRow gap={SPACING.xs} sx={{ flexWrap: "wrap" }}>
              {references.map((reference) => (
                <Box
                  key={reference.assetId}
                  sx={{ position: "relative", width: 72, borderRadius: BORDER_RADIUS.sm, overflow: "hidden" }}
                >
                  <ResponsiveImage
                    locator={`asset://${reference.assetId}`}
                    alt={t("i18n-cont-model-editor-11.aiRender.referenceAlt", { name: reference.name })}
                    aspectRatio="1/1"
                    fit="cover"
                    preferThumbnail
                  />
                  <ToolbarIconButton
                    icon={<CloseIcon fontSize="small" />}
                    tooltip={t("i18n-cont-model-editor-11.aiRender.removeReference")}
                    ariaLabel={t("i18n-cont-model-editor-11.aiRender.removeReferenceNamed", { name: reference.name })}
                    size="small"
                    onClick={() =>
                      setReferences((prev) => prev.filter((r) => r.assetId !== reference.assetId))
                    }
                    sx={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      backgroundColor: theme.vars.palette.c_scrim
                    }}
                  />
                </Box>
              ))}
            </FlexRow>
          )}
        </FlexColumn>

        <EditorButton
          variant="contained"
          startIcon={rendering ? <LoadingSpinner inline size={14} color="inherit" /> : <PhotoCameraOutlinedIcon />}
          onClick={() => void handleRender()}
          disabled={!canRender}
          fullWidth
        >
            {t("i18n-cont-model-editor-11.aiRender.render")}
        </EditorButton>
        {!canRender && <Caption>{t("i18n-cont-model-editor-11.aiRender.modelRequired")}</Caption>}
        {notice && (
          <AlertBanner severity="warning" compact onClose={() => setNotice(null)}>
            {notice}
          </AlertBanner>
        )}

        {renders.length > 1 && (
          <FlexColumn gap={SPACING.xs}>
            <Label size="small">{t("i18n-cont-model-editor-11.aiRender.earlierRenders")}</Label>
            <FlexRow gap={SPACING.xs} sx={{ flexWrap: "wrap" }}>
              {renders.map((entry) => (
                <FlexColumn key={entry.id} gap={SPACING.micro} sx={{ width: 96 }}>
                  <Box
                    component="button"
                    type="button"
                    aria-label={t("i18n-cont-model-editor-11.aiRender.showRender", { caption: entry.caption })}
                    aria-pressed={entry.id === shown?.id}
                    onClick={() => setShownId(entry.id)}
                    sx={{
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
                          <Caption color="error">{t("i18n-cont-model-editor-11.aiRender.failed")}</Caption>
                        )}
                      </FlexRow>
                    )}
                  </Box>
                </FlexColumn>
              ))}
            </FlexRow>
          </FlexColumn>
        )}
      </FlexColumn>
      </DropZone>
    </ScrollArea>
  );
};

export default memo(AiRenderPanel);
