/**
 * ConnectedModePromptBar — the top mode / prompt bar of the image editor.
 *
 * Mirrors the "AI image editor" chrome: document name + dimensions, a
 * segmented generation-mode toggle (Generate | Inpaint | Outpaint | Edit), a
 * prompt input, a model selector, and a primary action whose label and
 * behaviour track the active mode.
 *
 * Only the two backed modes run real pipelines:
 *   - generate → create a text-to-image layer + run it via useDirectGenJob
 *   - inpaint  → useInpaintHere (selection as mask), matching "Inpaint Here"
 * Outpaint and Edit have no backend yet and render as disabled segments.
 *
 * Follows the editor-shell convention: narrow store selectors only, actions
 * pulled via getState() inside handlers so the bar never re-renders on
 * unrelated store churn. Renders nothing without a bound document (the in-node
 * sketch modal has no session, same gate as SelectionActionBar).
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import {
  Chip,
  EditorButton,
  FlexRow,
  Text,
  TextInput,
  Toast
} from "../../ui_primitives";
import {
  SketchModeToggle,
  SketchModeOption
} from "../tool-settings-panels/SketchModeToggle";
import ImageModelSelect from "../../properties/ImageModelSelect";
import type { ImageModelValue } from "../../../stores/ApiTypes";
import { useSketchStore } from "../state/useSketchStore";
import type { SketchGenMode } from "../state/slices/toolSlice";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useInpaintHere } from "../../../hooks/sketch/useInpaintHere";
import { useDirectGenJob } from "../../../hooks/sketch/useDirectGenJob";
import { SKETCH_FONT } from "../sketchStyles";

interface ModeDescriptor {
  value: SketchGenMode;
  label: string;
  enabled: boolean;
  placeholder: string;
  hint: string;
}

const MODES: ModeDescriptor[] = [
  {
    value: "generate",
    label: "Generate",
    enabled: true,
    placeholder: "Describe the image…",
    hint: "Text-to-image — create a new layer from a prompt."
  },
  {
    value: "inpaint",
    label: "Inpaint",
    enabled: true,
    placeholder: "Replace selection with…",
    hint: "Regenerate the selected region using the selection as a mask."
  },
  {
    value: "outpaint",
    label: "Outpaint",
    enabled: false,
    placeholder: "Extend the image…",
    hint: "Coming soon — extend the image beyond its current bounds."
  },
  {
    value: "edit",
    label: "Edit",
    enabled: false,
    placeholder: "Describe the edit…",
    hint: "Coming soon — instruction-based image editing."
  }
];

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

const ConnectedModePromptBarInner: React.FC = () => {
  const theme = useTheme();

  const genMode = useSketchStore((s) => s.genMode);
  const setGenMode = useSketchStore((s) => s.setGenMode);
  const hasActiveSelection = useSketchStore((s) => s.hasActiveSelection);
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  const docW = useSketchStore((s) => s.document.canvas.width);
  const docH = useSketchStore((s) => s.document.canvas.height);

  const documentId = useSketchSessionStore((s) => s.documentId);
  const name = useSketchSessionStore((s) => s.name);

  const { inpaintHere, isBusy: inpaintBusy } = useInpaintHere();
  const { start } = useDirectGenJob();

  const [prompt, setPrompt] = useState("");
  const [seed] = useState(seedModelFromBindings);
  const [model, setModel] = useState(seed.model);
  const [provider, setProvider] = useState(seed.provider);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descriptor = useMemo(
    () => MODES.find((m) => m.value === genMode) ?? MODES[0],
    [genMode]
  );

  const handleModeChange = useCallback(
    (_e: React.MouseEvent<HTMLElement>, value: SketchGenMode | null) => {
      if (value) {
        setGenMode(value);
      }
    },
    [setGenMode]
  );

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
    } finally {
      setGenerating(false);
    }
  }, [model, prompt, provider, start]);

  const handleInpaint = useCallback(async () => {
    const result = await inpaintHere();
    if (!result.ok) {
      switch (result.reason) {
        case "no-selection":
          setError("Make a selection first to inpaint.");
          break;
        case "no-document":
          setError("No image document is open.");
          break;
        case "no-canvas":
          setError("Canvas is not ready yet.");
          break;
        case "error":
          setError(result.message ?? "Inpaint failed.");
          break;
      }
      return;
    }
    // Seed the freshly-bound inpaint layer with the typed prompt so the user
    // doesn't retype it in the layer panel before running the workflow.
    if (prompt.trim()) {
      useSketchSessionStore
        .getState()
        .setParamOverride(result.layerId, "prompt", prompt.trim());
    }
    setPrompt("");
  }, [inpaintHere, prompt]);

  const isBusy = inpaintBusy || generating;

  // Per-mode gate for the primary action.
  const actionDisabled =
    isBusy ||
    !descriptor.enabled ||
    (genMode === "generate" && (!prompt.trim() || !model)) ||
    (genMode === "inpaint" && !hasActiveSelection);

  const handleSubmit = useCallback(() => {
    if (genMode === "generate") {
      void handleGenerate();
    } else if (genMode === "inpaint") {
      void handleInpaint();
    }
  }, [genMode, handleGenerate, handleInpaint]);

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
          padding: theme.spacing(0.75, 1),
          backgroundColor: theme.vars.palette.grey[900],
          borderBottom: `1px solid ${theme.vars.palette.grey[800]}`
        }}
      >
        {/* Document name + dimensions */}
        <FlexRow align="center" gap={0.75} sx={{ flexShrink: 0, minWidth: 0 }}>
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

        {/* Generation-mode segmented toggle */}
        <SketchModeToggle
          value={genMode}
          exclusive
          onChange={handleModeChange}
          aria-label="Generation mode"
          sx={{ flexShrink: 0 }}
        >
          {MODES.map((m) => (
            <SketchModeOption
              key={m.value}
              value={m.value}
              disabled={!m.enabled}
              title={m.hint}
              data-testid={`sketch-gen-mode-${m.value}`}
            >
              {m.label}
            </SketchModeOption>
          ))}
        </SketchModeToggle>

        {/* Prompt */}
        <TextInput
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={descriptor.placeholder}
          compact
          fullWidth
          aria-label="Generation prompt"
          data-testid="sketch-gen-prompt"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !actionDisabled) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          slotProps={{
            input: {
              startAdornment: (
                <AutoAwesomeIcon
                  fontSize="small"
                  sx={{ mr: 0.5, color: theme.vars.palette.primary.main }}
                />
              ),
              endAdornment:
                genMode === "inpaint" ? (
                  <Chip compact label="mask" color="info" sx={{ ml: 0.5 }} />
                ) : undefined
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

        {/* Primary action — label tracks the active mode */}
        <EditorButton
          variant="contained"
          size="small"
          disabled={actionDisabled}
          onClick={handleSubmit}
          startIcon={<AutoAwesomeIcon fontSize="small" />}
          data-testid="sketch-gen-submit"
          sx={{ flexShrink: 0 }}
        >
          {descriptor.label}
        </EditorButton>
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
