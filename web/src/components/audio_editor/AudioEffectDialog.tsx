import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  NodeSlider,
  SPACING,
  Text
} from "../ui_primitives";
import ErrorBanner from "../support/ErrorBanner";
import { isNumber } from "../../utils/typePredicates";
import {
  PREVIEW_MAX_SECONDS,
  renderEffectPreview,
  type AudioEffect,
  type EffectParamSpec,
  type EffectParams
} from "./audioEffects";
import type { AudioSample } from "./audioSample";
import type { Selection } from "./WaveformView";
import { useEffectPreview } from "./useEffectPreview";

interface AudioEffectDialogProps {
  effect: AudioEffect;
  sample: AudioSample;
  selection: Selection | null;
  initialParams: EffectParams;
  getAudioContext: () => AudioContext;
  onApply: (effect: AudioEffect, params: EffectParams) => Promise<void>;
  onClose: () => void;
}

const UNITS_WITHOUT_SPACE = new Set(["%", "×", ":1", ""]);

const formatParam = (spec: EffectParamSpec, value: number): string => {
  const decimals = spec.step < 1 ? String(spec.step).split(".")[1].length : 0;
  const text = value.toFixed(decimals);
  return UNITS_WITHOUT_SPACE.has(spec.unit)
    ? `${text}${spec.unit}`
    : `${text} ${spec.unit}`;
};

interface ParamSliderProps {
  spec: EffectParamSpec;
  value: number;
  onChange: (key: string, value: number) => void;
  onCommit: () => void;
}

const ParamSlider = memo(function ParamSlider({
  spec,
  value,
  onChange,
  onCommit
}: ParamSliderProps) {
  const { t } = useTranslation();
  const handleChange = useCallback(
    (_event: Event, next: number | number[]) => {
      if (isNumber(next)) {
        onChange(spec.key, next);
      }
    },
    [onChange, spec.key]
  );
  return (
    <FlexColumn gap={SPACING.xs}>
      <FlexRow align="center" justify="space-between">
        <Label size="small">{t(`batch2_16.effects.params.${spec.key}`)}</Label>
        <Caption>{formatParam(spec, value)}</Caption>
      </FlexRow>
      <NodeSlider
        aria-label={t(`batch2_16.effects.params.${spec.key}`)}
        value={value}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        changed={value !== spec.defaultValue}
        onChange={handleChange}
        onChangeCommitted={onCommit}
      />
    </FlexColumn>
  );
});

/**
 * Parameter dialog for one effect: sliders, an audition of the processed
 * selection (re-rendered when a slider is released), and Apply, which commits
 * the effect as one undoable edit.
 */
const AudioEffectDialog = ({
  effect,
  sample,
  selection,
  initialParams,
  getAudioContext,
  onApply,
  onClose
}: AudioEffectDialogProps) => {
  const { t } = useTranslation();
  const [params, setParams] = useState<EffectParams>(initialParams);
  // Slider release reads the latest values without waiting for a re-render.
  const paramsRef = useRef(params);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    active: previewing,
    play,
    stop: stopPreview
  } = useEffectPreview(getAudioContext);

  const updateParams = useCallback((next: EffectParams) => {
    paramsRef.current = next;
    setParams(next);
  }, []);

  const startPreview = useCallback(
    (next: EffectParams) => {
      setError(null);
      play(() =>
        renderEffectPreview(
          sample,
          effect,
          next,
          selection?.start,
          selection?.end
        )
      ).catch((e: unknown) => {
        stopPreview();
        setError(e instanceof Error ? e.message : String(e));
      });
    },
    [play, stopPreview, sample, effect, selection]
  );

  const handleParamChange = useCallback(
    (key: string, value: number) => {
      updateParams({ ...paramsRef.current, [key]: value });
    },
    [updateParams]
  );

  // Re-render the audition with the released slider's value.
  const handleCommit = useCallback(() => {
    if (previewing) {
      startPreview(paramsRef.current);
    }
  }, [previewing, startPreview]);

  const handleTogglePreview = useCallback(() => {
    if (previewing) {
      stopPreview();
    } else {
      startPreview(paramsRef.current);
    }
  }, [previewing, stopPreview, startPreview]);

  const handleReset = useCallback(() => {
    const defaults = Object.fromEntries(
      effect.params.map((p) => [p.key, p.defaultValue])
    );
    updateParams(defaults);
    if (previewing) {
      startPreview(defaults);
    }
  }, [effect, previewing, startPreview, updateParams]);

  const handleClose = useCallback(() => {
    stopPreview();
    onClose();
  }, [stopPreview, onClose]);

  const handleApply = useCallback(async () => {
    stopPreview();
    setApplying(true);
    setError(null);
    try {
      await onApply(effect, paramsRef.current);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setApplying(false);
    }
  }, [stopPreview, onApply, effect, onClose]);

  const reportContext = useMemo(
    () => ({
      source: "operation-failure" as const,
      summary: t("batch2_16.effectDialog.failureSummary", { effect: t(`batch2_16.effects.${effect.id}.label`) }),
      errorText: error ?? undefined
    }),
    [effect.id, error, t]
  );

  const scope = selection
    ? t("batch2_16.effectDialog.selectionScope")
    : t("batch2_16.effectDialog.clipScope");

  return (
    <Dialog
      open
      onClose={applying ? undefined : handleClose}
      title={t(`batch2_16.effects.${effect.id}.label`)}
      maxWidth="xs"
      fullWidth
      actions={
        <FlexRow align="center" gap={SPACING.sm} fullWidth>
          <EditorButton
            size="small"
            onClick={handleTogglePreview}
            disabled={applying}
          >
            {previewing ? t("batch2_16.effectDialog.stopPreview") : t("batch2_16.effectDialog.preview")}
          </EditorButton>
          <EditorButton
            size="small"
            variant="text"
            onClick={handleReset}
            disabled={applying}
          >
            {t("batch2_16.effectDialog.reset")}
          </EditorButton>
          <FlexRow sx={{ flexGrow: 1 }} />
          <EditorButton
            size="small"
            variant="text"
            onClick={handleClose}
            disabled={applying}
          >
            {t("batch2_16.effectDialog.cancel")}
          </EditorButton>
          <EditorButton
            size="small"
            variant="contained"
            onClick={handleApply}
            disabled={applying}
          >
            {applying ? t("batch2_16.effectDialog.applying") : t("batch2_16.effectDialog.apply")}
          </EditorButton>
        </FlexRow>
      }
    >
      <FlexColumn gap={SPACING.md}>
        <Text size="small" color="secondary">
          {t(`batch2_16.effects.${effect.id}.description`)} {scope}{" "}
          {t("batch2_16.effectDialog.previewLimit", { count: PREVIEW_MAX_SECONDS })}
        </Text>
        {effect.params.map((spec) => (
          <ParamSlider
            key={spec.key}
            spec={spec}
            value={params[spec.key] ?? spec.defaultValue}
            onChange={handleParamChange}
            onCommit={handleCommit}
          />
        ))}
        {error && (
          <ErrorBanner report={reportContext}>{error}</ErrorBanner>
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default AudioEffectDialog;
