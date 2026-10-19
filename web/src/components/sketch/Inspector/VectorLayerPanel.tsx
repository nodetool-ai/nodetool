import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { isModelSelected } from "@nodetool-ai/protocol";
import {
  decodeSketchLayerData,
  encodeSketchLayerData
} from "@nodetool-ai/protocol/api-schemas/sketch.js";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { useSketchStore } from "../state";
import type { Layer } from "../types";
import { formatSvgSource, getVectorSource } from "../vectorLayer";
import { dataUrlToCanvas } from "../serialization";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import {
  AlertBanner,
  Caption,
  Dialog,
  Divider,
  EditorButton,
  FlexColumn,
  FlexRow,
  SPACING,
  TextArea,
  TextInput
} from "../../ui_primitives";
import {
  useGenerateSvg,
  type GenerateSvgTarget
} from "../../../hooks/sketch/useGenerateSvg";

const isSubmitShortcut = (event: React.KeyboardEvent): boolean =>
  event.key === "Enter" && (event.metaKey || event.ctrlKey);

const errorMessage = (cause: unknown, fallback: string): string =>
  cause instanceof Error ? cause.message : fallback;

/** The chat model, which `useGenerateSvg` sends with each request. */
function SvgModelSelect({ disabled }: { disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const model = useGlobalChatStore((state) => state.selectedModel);
  const setSelectedModel = useGlobalChatStore((state) => state.setSelectedModel);
  return (
    <LanguageModelSelect
      value={isModelSelected(model) ? model.id : ""}
      provider={model?.provider}
      onChange={setSelectedModel}
      placeholder={t("i18n-next4.sketch.vector.model")}
      disabled={disabled}
    />
  );
}

interface SvgPromptFormProps {
  label: string;
  placeholder: string;
  submitLabel: string;
  target: GenerateSvgTarget;
  /** Receives the generated markup. A thrown error is shown under the form. */
  onSvg: (svg: string, request: string) => void;
}

/** A prompt, a model picker and a Generate button that yield SVG markup. */
function SvgPromptForm({
  label,
  placeholder,
  submitLabel,
  target,
  onSvg
}: SvgPromptFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const [request, setRequest] = useState("");
  const [applyError, setApplyError] = useState("");
  const { generate, cancel, generating, error, clearError } = useGenerateSvg();
  const submit = async (): Promise<void> => {
    if (generating || request.trim() === "") {
      return;
    }
    setApplyError("");
    const svg = await generate(request, target);
    if (!svg) {
      return;
    }
    try {
      onSvg(svg, request.trim());
    } catch (cause) {
      setApplyError(
        t("i18n-next4.sketch.vector.applyGeneratedError", { error: errorMessage(cause, t("i18n-next4.sketch.vector.svgCouldNotBeUsed")) })
      );
    }
  };
  const shownError = error ?? applyError;
  return (
    <FlexColumn gap={SPACING.sm}>
      <TextArea
        label={label}
        placeholder={placeholder}
        minRows={2}
        maxRows={6}
        value={request}
        disabled={generating}
        onChange={(value) => {
          setRequest(value);
          clearError();
          setApplyError("");
        }}
        onKeyDown={(event) => {
          if (isSubmitShortcut(event)) {
            event.preventDefault();
            void submit();
          }
        }}
      />
      <FlexRow gap={SPACING.sm} align="center" justify="space-between">
        <SvgModelSelect disabled={generating} />
        {generating ? (
          <EditorButton variant="outlined" onClick={cancel}>
            {t("i18n-next4.sketch.cancel")}
          </EditorButton>
        ) : (
          <EditorButton
            variant="contained"
            disabled={request.trim() === ""}
            onClick={() => {
              void submit();
            }}
          >
            {submitLabel}
          </EditorButton>
        )}
      </FlexRow>
      {generating && <Caption role="status">{t("i18n-next4.sketch.vector.generatingSvg")}</Caption>}
      {shownError && <AlertBanner severity="error">{shownError}</AlertBanner>}
    </FlexColumn>
  );
}

const layerNameFromRequest = (request: string): string => {
  const name = request.replace(/\s+/g, " ").trim();
  return name.length > 40 ? `${name.slice(0, 39).trimEnd()}…` : name || "SVG";
};

interface SvgLayerImportProps {
  /** The layers panel opens the file picker through this ref. */
  inputRef: React.RefObject<HTMLInputElement | null>;
}

/** Hidden SVG file picker that adds the chosen file as a vector layer. */
export function SvgLayerImport({
  inputRef
}: SvgLayerImportProps): React.JSX.Element {
  const { t } = useTranslation();
  const addVectorLayer = useSketchStore((state) => state.addVectorLayer);
  const [error, setError] = useState("");
  const importFile = async (file: File): Promise<void> => {
    try {
      addVectorLayer(file.name.replace(/\.svg$/i, ""), await file.text());
      setError("");
    } catch (cause) {
      setError(errorMessage(cause, t("i18n-next4.sketch.vector.couldNotImportSvg")));
    }
  };
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".svg,image/svg+xml"
        aria-label={t("i18n-next4.sketch.vector.importSvgFile")}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            void importFile(file);
          }
        }}
      />
      {error && (
        <AlertBanner severity="error" onClose={() => setError("")}>
          {error}
        </AlertBanner>
      )}
    </>
  );
}

interface GenerateSvgLayerDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Prompt dialog that generates a new vector layer at the canvas size. */
export function GenerateSvgLayerDialog({
  open,
  onClose
}: GenerateSvgLayerDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const addVectorLayer = useSketchStore((state) => state.addVectorLayer);
  const canvasWidth = useSketchStore((state) => state.document.canvas.width);
  const canvasHeight = useSketchStore((state) => state.document.canvas.height);
  const target = useMemo(
    () => ({ width: canvasWidth, height: canvasHeight }),
    [canvasWidth, canvasHeight]
  );
  return (
    <Dialog open={open} onClose={onClose} title={t("i18n-next4.sketch.vector.generateSvgLayer")}>
      <SvgPromptForm
        label={t("i18n-next4.sketch.vector.describeNewLayer")}
        placeholder={t("i18n-next4.sketch.vector.paperPlanePrompt")}
        submitLabel={t("i18n-next4.sketch.vector.generate")}
        target={target}
        onSvg={(svg, request) => {
          addVectorLayer(layerNameFromRequest(request), svg);
          onClose();
        }}
      />
    </Dialog>
  );
}

interface VectorLayerPanelProps {
  layer: Layer;
}

export function VectorLayerPanel({
  layer
}: VectorLayerPanelProps): React.JSX.Element {
  const { t } = useTranslation();
  const savedSource = getVectorSource(layer);
  // The stored markup is minified; show it one element per line.
  const savedText = useMemo(() => formatSvgSource(savedSource), [savedSource]);
  const [source, setSource] = useState(savedText);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setVectorLayerSource = useSketchStore(
    (state) => state.setVectorLayerSource
  );
  const rasterizeVectorLayer = useSketchStore(
    (state) => state.rasterizeVectorLayer
  );
  useEffect(() => {
    setSource(savedText);
    setError("");
  }, [savedText]);
  const dirty = source !== savedText;
  const { width, height } = layer.contentBounds;
  const target = useMemo(
    () => ({ width, height, currentSvg: savedSource }),
    [width, height, savedSource]
  );

  const apply = (): void => {
    if (busy || !dirty) {
      return;
    }
    try {
      setVectorLayerSource(layer.id, source);
      setError("");
    } catch (cause) {
      setError(errorMessage(cause, t("i18n-next4.sketch.vector.couldNotUpdateSvg")));
    }
  };
  const rasterize = async (): Promise<void> => {
    setBusy(true);
    try {
      const decoded = decodeSketchLayerData(
        layer.data,
        layer.contentBounds.width,
        layer.contentBounds.height
      );
      if (!decoded.image) {
        throw new Error(t("i18n-next4.sketch.vector.layerHasNoSvgSource"));
      }
      const canvas = await dataUrlToCanvas(
        decoded.image,
        decoded.bounds.width,
        decoded.bounds.height
      );
      rasterizeVectorLayer(
        layer.id,
        encodeSketchLayerData(canvas.toDataURL("image/png"), decoded.bounds),
        layer.data
      );
    } catch (cause) {
      setError(errorMessage(cause, t("i18n-next4.sketch.vector.couldNotRasterizeSvg")));
    } finally {
      setBusy(false);
    }
  };
  return (
    <FlexColumn gap={SPACING.lg} sx={{ p: SPACING.md }}>
      <Caption>
        {t("i18n-next4.sketch.vector.layerDescription", { width, height })}
      </Caption>

      <FlexColumn gap={SPACING.sm}>
        <SvgPromptForm
          label={t("i18n-next4.sketch.vector.generateWithAi")}
          placeholder={t("i18n-next4.sketch.vector.autumnLeavesPrompt")}
          submitLabel={t("i18n-next4.sketch.vector.generate")}
          target={target}
          onSvg={(svg) => setVectorLayerSource(layer.id, svg)}
        />
        <Caption>{t("i18n-next4.sketch.vector.replaceSvgUndoRestores")}</Caption>
      </FlexColumn>

      <FlexColumn gap={SPACING.sm}>
        <TextInput
          label={t("i18n-next4.sketch.vector.svgSource")}
          multiline
          monospace
          minRows={8}
          maxRows={18}
          value={source}
          spellCheck={false}
          onChange={(event) => setSource(event.target.value)}
          onKeyDown={(event) => {
            if (isSubmitShortcut(event)) {
              event.preventDefault();
              apply();
            }
          }}
        />
        {error && <AlertBanner severity="error">{error}</AlertBanner>}
        <FlexRow gap={SPACING.sm} justify="flex-end">
          <EditorButton
            disabled={busy || !dirty}
            onClick={() => {
              setSource(savedText);
              setError("");
            }}
          >
            {t("i18n-next4.sketch.vector.revert")}
          </EditorButton>
          <EditorButton
            variant="contained"
            tooltip={t("i18n-next4.sketch.vector.applySvg")}
            shortcut={["Ctrl", "Enter"]}
            onClick={apply}
            disabled={busy || !dirty}
          >
            {t("i18n-next4.sketch.vector.applySvg")}
          </EditorButton>
        </FlexRow>
      </FlexColumn>

      <Divider />
      <FlexRow gap={SPACING.sm} justify="space-between" wrap>
        <EditorButton
          disabled={busy}
          onClick={() => {
            void rasterize();
          }}
        >
          {t("i18n-next4.sketch.vector.rasterizeLayer")}
        </EditorButton>
        <EditorButton
          onClick={() => {
            const link = document.createElement("a");
            link.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(savedSource)}`;
            link.download = `${layer.name}.svg`;
            link.click();
          }}
        >
          {t("i18n-next4.sketch.vector.downloadSvg")}
        </EditorButton>
      </FlexRow>
    </FlexColumn>
  );
}
