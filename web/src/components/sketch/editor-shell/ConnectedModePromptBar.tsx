/**
 * ConnectedModePromptBar — the top prompt bar of the image editor.
 *
 * Drives full-frame text-to-image generation: document name + dimensions, a
 * prompt input, a model selector, and a Generate action that creates a new
 * text-to-image layer and runs it via useDirectGenJob. Selection-driven
 * inpainting lives in the floating SelectionActionBar instead.
 *
 * Follows the editor-shell convention: narrow store selectors only, actions
 * pulled via getState() inside handlers so the bar never re-renders on
 * unrelated store churn. Renders nothing without a bound document (the in-node
 * sketch modal has no session, same gate as SelectionActionBar).
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTheme } from "@mui/material/styles";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AspectRatioIcon from "@mui/icons-material/CropOriginal";
import ResolutionIcon from "@mui/icons-material/Tv";
import ImageIcon from "@mui/icons-material/Image";

import {
  EditorButton,
  FlexRow,
  LoadingSpinner,
  TextInput,
  Toast
} from "../../ui_primitives";
import MediaControlChip from "../../chat/composer/MediaControlChip";
import MediaAspectRatioMenu from "../../chat/composer/MediaAspectRatioMenu";
import MediaOptionMenu from "../../chat/composer/MediaOptionMenu";
import { buildImageModelOptions } from "../../chat/composer/imageModelOptions";
import { clampToAllowed } from "../../chat/composer/videoModelOptions";
import ImageModelMenuDialog from "../../model_menu/ImageModelMenuDialog";
import type { ImageModel } from "../../../stores/ApiTypes";
import {
  deriveImageSizePreset,
  resolveImageSize,
  type ImageResolution
} from "../../../stores/MediaGenerationStore";
import { useSketchStore } from "../state/useSketchStore";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useDirectGenJob } from "../../../hooks/sketch/useDirectGenJob";
import { useMediaOptions } from "../../../hooks/useModelsByProvider";
import { SKETCH_SPACING } from "../sketchStyles";

/** Most recent direct-gen binding's model, to seed the bar's picker. */
function seedModelFromBindings(): { model: string; provider: string } {
  const bindings = Object.values(useSketchSessionStore.getState().bindings);
  const last = bindings
    .filter((b) => b.kind === "text-to-image" || b.kind === "image-to-image")
    .pop();
  return { model: last?.model ?? "", provider: last?.provider ?? "" };
}

/** Unique layer name within the current document. */
function uniqueLayerName(base: string): string {
  const existing = new Set(
    useSketchStore.getState().document.layers.map((l) => l.name)
  );
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

interface ConnectedModePromptBarProps {
  /** Document-level actions rendered at the trailing edge of the bar (e.g.
   * Save/Done when the editor is embedded in an asset tab). */
  trailingActions?: React.ReactNode;
}

const ConnectedModePromptBarInner: React.FC<ConnectedModePromptBarProps> = ({
  trailingActions
}) => {
  const theme = useTheme();

  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  const docW = useSketchStore((s) => s.document.canvas.width);
  const docH = useSketchStore((s) => s.document.canvas.height);

  const documentId = useSketchSessionStore((s) => s.documentId);

  const { start } = useDirectGenJob();

  const [prompt, setPrompt] = useState("");
  const [seed] = useState(seedModelFromBindings);
  const [model, setModel] = useState(seed.model);
  const [provider, setProvider] = useState(seed.provider);
  // The remembered seed carries only ids, so the chip shows the id until a
  // model is picked through the dialog (which provides a display name).
  const [modelName, setModelName] = useState(seed.model);
  // Per-model option constraints from the freshly-picked model. Empty until a
  // model is chosen through the dialog; before that the seeded model's
  // constraints come from useMediaOptions below.
  const [modelConstraints, setModelConstraints] = useState<{
    aspectRatios?: string[];
    resolutions?: string[];
  }>({});
  const imageModelAnchorRef = useRef<HTMLButtonElement>(null);
  const [imageModelOpen, setImageModelOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generated-image size — aspect ratio + resolution, mirroring the media
  // composer. These shape the generation output only; the artboard size is
  // controlled separately in the canvas panel. Seeded from the current canvas
  // so the first generation defaults to the artboard's shape.
  const [sizeSeed] = useState(() => deriveImageSizePreset(docW, docH));
  const [aspectRatio, setAspectRatio] = useState(sizeSeed.aspectRatio);
  const [resolution, setResolution] = useState<ImageResolution>(
    sizeSeed.resolution
  );
  const [aspectAnchor, setAspectAnchor] = useState<HTMLElement | null>(null);
  const [resolutionAnchor, setResolutionAnchor] = useState<HTMLElement | null>(
    null
  );

  // Constraints for the seeded/remembered model, so the menus are limited even
  // before the picker dialog is reopened. A freshly-picked model's constraints
  // (set in handlePickImageModel) take precedence over the fetched ones.
  const mediaOptions = useMediaOptions({ provider, model, task: "image" });
  const effectiveConstraints = useMemo(() => {
    const picked =
      modelConstraints.aspectRatios !== undefined ||
      modelConstraints.resolutions !== undefined;
    return picked
      ? modelConstraints
      : {
          aspectRatios: mediaOptions.data?.aspectRatios,
          resolutions: mediaOptions.data?.resolutions
        };
  }, [modelConstraints, mediaOptions.data]);

  const { aspectOptions, resolutionOptions } = useMemo(
    () => buildImageModelOptions(effectiveConstraints),
    [effectiveConstraints]
  );
  const aspectIds = useMemo(
    () => aspectOptions.map((a) => a.id),
    [aspectOptions]
  );
  const resolutionIds = useMemo(
    () => resolutionOptions.map((r) => r.id),
    [resolutionOptions]
  );

  // Snap the current aspect / resolution into the selected model's allowed sets
  // when the model (and thus the option lists) changes. clampToAllowed returns
  // the value unchanged when it already qualifies, so this no-ops on manual
  // changes and never loops. Only the generation size is affected — never the
  // canvas.
  useEffect(() => {
    const nextAspect = clampToAllowed(aspectRatio, aspectIds);
    const nextResolution = clampToAllowed(resolution, resolutionIds);
    if (nextAspect !== aspectRatio) setAspectRatio(nextAspect);
    if (nextResolution !== resolution) setResolution(nextResolution);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the allowed-id lists so it runs once per model change; guarded to no-op when values already qualify
  }, [aspectIds, resolutionIds]);

  const handleResolutionChange = useCallback((r: ImageResolution) => {
    setResolution(r);
  }, []);

  const handleAspectChange = useCallback((a: string) => {
    setAspectRatio(a);
  }, []);

  const handlePickImageModel = useCallback((m: ImageModel) => {
    setModel(m.id);
    setProvider(m.provider);
    setModelName(m.name || m.id);
    setModelConstraints({
      aspectRatios: m.aspect_ratios ?? undefined,
      resolutions: m.resolutions ?? undefined
    });
    setImageModelOpen(false);
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const layerId = useSketchStore
        .getState()
        .addLayer(uniqueLayerName("Text-to-Image"));
      const { width, height } = resolveImageSize(resolution, aspectRatio);
      useSketchSessionStore.getState().upsertBinding({
        layerId,
        kind: "text-to-image",
        prompt: prompt.trim(),
        provider,
        model,
        width,
        height,
        aspectRatio,
        resolution,
        sourceLayerId: null,
        status: "draft",
        versions: []
      });
      useSketchStore.getState().setActiveLayer(layerId);
      await start(layerId);
      setPrompt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [model, prompt, provider, resolution, aspectRatio, start]);

  const actionDisabled = generating || !prompt.trim() || !model;

  // Hide with the rest of the chrome on Tab (panelsHidden = chrome-less canvas),
  // matching ConnectedToolTopBar. No bound document → no session to act on.
  if (!documentId || panelsHidden) {
    return null;
  }

  return (
    <>
      <FlexRow
        className="sketch-mode-prompt-bar"
        data-testid="sketch-mode-prompt-bar"
        align="center"
        gap={1}
        sx={{
          flexShrink: 0,
          width: "100%",
          // The prompt bar is the editor's hero input, so it carries more
          // height than the utility tool-options bar below it. Generous
          // vertical room keeps the controls from feeling crammed.
          minHeight: 56,
          padding: `${SKETCH_SPACING.lg} ${SKETCH_SPACING.xl}`,
          backgroundColor: theme.vars.palette.grey[900],
          borderBottom: `1px solid ${theme.vars.palette.grey[800]}`
        }}
      >
        {/* Prompt — grows to fill */}
        <TextInput
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image…"
          compact
          fullWidth
          inputProps={{
            "aria-label": "Generation prompt",
            "data-testid": "sketch-gen-prompt"
          }}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !actionDisabled &&
              !e.nativeEvent.isComposing &&
              e.nativeEvent.keyCode !== 229
            ) {
              e.preventDefault();
              void handleGenerate();
            }
          }}
          slotProps={{
            input: {
              startAdornment: (
                <AutoAwesomeIcon
                  fontSize="small"
                  sx={{ mr: 0.5, color: theme.vars.palette.primary.main }}
                />
              )
            }
          }}
          sx={{
            flex: 1,
            minWidth: 160,
            // Match the control/button height so the row aligns.
            "& .MuiOutlinedInput-root": { height: 34 }
          }}
        />

        {/* Model selector — same chip + dialog as the media composer */}
        <MediaControlChip
          ref={imageModelAnchorRef}
          icon={<ImageIcon fontSize="small" />}
          label={modelName || "Select Model"}
          active={imageModelOpen}
          onClick={() => setImageModelOpen(true)}
          truncate
          showChevron={false}
        />
        {imageModelOpen && (
          <ImageModelMenuDialog
            open
            anchorEl={imageModelAnchorRef.current}
            onClose={() => setImageModelOpen(false)}
            onModelChange={handlePickImageModel}
            task="text_to_image"
          />
        )}

        {/* Resolution */}
        <MediaControlChip
          icon={<ResolutionIcon fontSize="small" />}
          label={resolution}
          active={!!resolutionAnchor}
          onClick={(e) => setResolutionAnchor(e.currentTarget)}
          showChevron={false}
        />
        <MediaOptionMenu
          anchorEl={resolutionAnchor}
          open={!!resolutionAnchor}
          onClose={() => setResolutionAnchor(null)}
          header="Resolution"
          value={resolution}
          options={resolutionOptions}
          onChange={handleResolutionChange}
        />

        {/* Aspect ratio */}
        <MediaControlChip
          icon={<AspectRatioIcon fontSize="small" />}
          label={aspectRatio}
          active={!!aspectAnchor}
          onClick={(e) => setAspectAnchor(e.currentTarget)}
          showChevron={false}
        />
        <MediaAspectRatioMenu
          anchorEl={aspectAnchor}
          open={!!aspectAnchor}
          onClose={() => setAspectAnchor(null)}
          value={aspectRatio}
          options={aspectOptions}
          onChange={handleAspectChange}
        />

        {/* Primary action — full-frame text-to-image */}
        <EditorButton
          variant="contained"
          size="small"
          disabled={actionDisabled}
          onClick={() => void handleGenerate()}
          startIcon={
            generating ? (
              <LoadingSpinner inline size={14} color="inherit" />
            ) : (
              <AutoAwesomeIcon fontSize="small" />
            )
          }
          data-testid="sketch-gen-submit"
          sx={{ flexShrink: 0, height: 34 }}
        >
          Generate
        </EditorButton>

        {trailingActions}
      </FlexRow>

      <Toast
        open={error !== null}
        message={error ?? ""}
        severity="warning"
        onClose={() => setError(null)}
        vertical="top"
        horizontal="center"
      />
    </>
  );
};

export const ConnectedModePromptBar = memo(ConnectedModePromptBarInner);
ConnectedModePromptBar.displayName = "ConnectedModePromptBar";

export default ConnectedModePromptBar;
