/**
 * ConnectedGeneratePopover — the image editor's text-to-image form.
 *
 * Drives full-frame text-to-image generation: a prompt input, model selector,
 * size chips, and a Generate action that creates a new text-to-image layer and
 * runs it via useDirectGenJob. Selection-driven inpainting lives in the
 * floating SelectionActionBar instead.
 *
 * The form lives in a popover opened from the tool bar's Generate button, so
 * the editor's chrome stays a single slim row.
 *
 * Follows the editor-shell convention: narrow store selectors only, actions
 * pulled via getState() inside handlers so the form never re-renders on
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
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Popover,
  TextInput,
  Toast,
  BORDER_RADIUS
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

/** Most recent direct-gen binding's model, to seed the form's picker. */
function seedModelFromBindings() {
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

interface ConnectedGeneratePopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

const ConnectedGeneratePopoverInner: React.FC<ConnectedGeneratePopoverProps> = ({
  open,
  anchorEl,
  onClose
}) => {
  const theme = useTheme();

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

  // No bound document → no session to act on (the in-node sketch modal).
  if (!documentId) {
    return null;
  }

  return (
    <>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={onClose}
        placement="bottom-right"
        paperSx={{
          width: 340,
          backgroundColor: theme.vars.palette.grey[900],
          border: `1px solid ${theme.vars.palette.grey[800]}`,
          borderRadius: BORDER_RADIUS.sm
        }}
      >
        <FlexColumn
          className="sketch-generate-form"
          data-testid="sketch-generate-form"
          gap={1}
          sx={{ padding: SKETCH_SPACING.lg }}
        >
          <TextInput
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image…"
            autoFocus
            multiline
            minRows={2}
            maxRows={6}
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
          />

          <FlexRow align="center" gap={1} sx={{ flexWrap: "wrap" }}>
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
          </FlexRow>

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
            sx={{ alignSelf: "flex-end", height: 34 }}
          >
            Generate
          </EditorButton>
        </FlexColumn>
      </Popover>

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

export const ConnectedGeneratePopover = memo(ConnectedGeneratePopoverInner);
ConnectedGeneratePopover.displayName = "ConnectedGeneratePopover";

export default ConnectedGeneratePopover;
