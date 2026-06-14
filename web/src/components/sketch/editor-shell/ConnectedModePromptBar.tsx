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

import React, { memo, useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import {
  Chip,
  EditorButton,
  FlexRow,
  LoadingSpinner,
  Text,
  TextInput,
  Toast
} from "../../ui_primitives";
import ImageModelSelect from "../../properties/ImageModelSelect";
import type { ImageModelValue } from "../../../stores/ApiTypes";
import { useSketchStore } from "../state/useSketchStore";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useDirectGenJob } from "../../../hooks/sketch/useDirectGenJob";
import { SKETCH_FONT, SKETCH_SPACING } from "../sketchStyles";

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
  const name = useSketchSessionStore((s) => s.name);

  const { start } = useDirectGenJob();

  const [prompt, setPrompt] = useState("");
  const [seed] = useState(seedModelFromBindings);
  const [model, setModel] = useState(seed.model);
  const [provider, setProvider] = useState(seed.provider);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleModelChange = useCallback((v: ImageModelValue) => {
    setModel(v.id);
    setProvider(v.provider);
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const layerId = useSketchStore
        .getState()
        .addLayer(uniqueLayerName("Text-to-Image"));
      useSketchSessionStore.getState().upsertBinding({
        layerId,
        kind: "text-to-image",
        prompt: prompt.trim(),
        provider,
        model,
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
  }, [model, prompt, provider, start]);

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
        {/* Document name + dimensions */}
        <FlexRow align="center" gap={1} sx={{ flexShrink: 0, minWidth: 0 }}>
          <Text
            size="small"
            sx={{
              fontWeight: 600,
              maxWidth: 160,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
            title={name}
          >
            {name || "Untitled"}
          </Text>
          <Chip
            compact
            label={`${docW} × ${docH} · sRGB`}
            sx={{ fontFamily: SKETCH_FONT.familyMono }}
          />
        </FlexRow>

        {/* Prompt */}
        <TextInput
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image…"
          compact
          fullWidth
          aria-label="Generation prompt"
          data-testid="sketch-gen-prompt"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !actionDisabled) {
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
          sx={{ flex: 1, minWidth: 120 }}
        />

        {/* Model selector */}
        <FlexRow sx={{ flexShrink: 0 }}>
          <ImageModelSelect
            value={model}
            task="text_to_image"
            onChange={handleModelChange}
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
          sx={{ flexShrink: 0 }}
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
