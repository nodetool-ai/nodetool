import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";

import {
  Box,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  MenuItemPrimitive,
  SaveStatus,
  SPACING,
  TruncatedText,
  TYPOGRAPHY,
  UndoRedoButtons
} from "../ui_primitives";
import type { DocumentBarRender } from "../ui_primitives";
import {
  DocumentMoreMenu,
  DocumentSaveButton,
  explicitSaveStatus
} from "../workspace/documentBarParts";
import { useDocumentDraftStore } from "../../stores/DocumentDraftStore";
import { BASE_URL } from "../../stores/BASE_URL";
import type { Asset } from "../../stores/ApiTypes";
import { useSaveAudioToAsset } from "../../hooks/audio/useSaveAudioToAsset";
import ReportBugButton from "../support/ReportBugButton";
import { TransformWithWorkflowView } from "../assets/TransformWithWorkflowDialog";
import {
  transformSourceFromAsset,
  type TransformApplyAction,
  type TransformSource
} from "../assets/transformWorkflow";
import { resolveMediaUri } from "../../utils/resolveMediaUri";
import WaveformView, { type Selection } from "./WaveformView";
import AudioEditorToolbar from "./AudioEditorToolbar";
import AudioTransportBar from "./AudioTransportBar";
import { formatEditorTime } from "./formatEditorTime";
import AudioEffectDialog from "./AudioEffectDialog";
import {
  applyEffect,
  defaultEffectParams,
  getAudioEffect,
  type AudioEffect,
  type EffectParams
} from "./audioEffects";
import { useEditHistory } from "./useEditHistory";
import { validateAudioEffectParams } from "@nodetool-ai/protocol/api-schemas/asset-editor-tool-contracts.js";
import { applyAudioEdit, summarizePeaks } from "./audioAgentOps";
import {
  setAudioAgentHandler,
  type AudioAgentHandler,
  type AudioSnapshot
} from "./audioAgentBridge";
import { createPlayheadStore } from "./playheadStore";
import {
  applyGain,
  arrayBufferToBase64,
  audioBufferToSample,
  encodeWav,
  cropToRange,
  deleteRange,
  fade,
  normalize,
  reverseRange,
  sampleDuration,
  sampleToAudioBuffer,
  silenceRange,
  type AudioSample
} from "./audioSample";

interface AudioSampleEditorProps {
  asset: Asset;
  /** Draws Done. A workspace tab leaves it out (it has View/Edit). */
  onClose?: () => void;
  active?: boolean;
  /**
   * Replaces the default save, which overwrites the asset's bytes. Resolves
   * true when the sample was stored, so the editor can mark it clean.
   */
  onSaveSample?: (sample: AudioSample) => Promise<boolean>;
  /** Region (seconds) selected once the audio has loaded. */
  initialSelection?: Selection;
  /**
   * Draws the document bar (a workspace tab). The save status, Undo/Redo,
   * Save and Transform with workflow move into it; the edits and effects
   * stay in the toolbar.
   */
  documentBar?: DocumentBarRender;
  /**
   * Serve the `ui_audio_*` agent tools for this asset while the sample is
   * loaded. Set by the workspace tab, which is what `ui_context` names.
   */
  serveAgentTools?: boolean;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 64;
const ZOOM_STEP = 1.5;

const resolveMediaUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const trimmed = url.trim();
  if (trimmed === "") return null;
  if (/^(https?:|data:|blob:)/.test(trimmed)) return trimmed;
  return trimmed.startsWith("/") ? `${BASE_URL}${trimmed}` : trimmed;
};

const getAudioContextCtor = (): typeof AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (window.AudioContext) return window.AudioContext;
  if ("webkitAudioContext" in window) {
    return window.webkitAudioContext as typeof AudioContext;
  }
  return null;
};

/**
 * In-browser audio sample editor (Audacity-style): decode an asset into PCM,
 * select a region on the waveform, apply destructive edits (trim, delete,
 * silence, fade, normalize, reverse, gain) and effects from `audioEffects.ts`
 * (EQ, dynamics, reverb, echo, speed, …) with undo/redo, audition with the
 * transport, and save the result back to the asset as WAV.
 *
 * The playhead advances every animation frame during playback, so it lives in
 * an external store (`playheadStore`) rather than state here — only the
 * playhead line and the clock subscribe, and this component doesn't re-render
 * per frame.
 */
const AudioSampleEditor = ({
  asset,
  onClose,
  active = true,
  onSaveSample,
  initialSelection,
  documentBar,
  serveAgentTools = false
}: AudioSampleEditorProps) => {
  const { t } = useTranslation();
  const history = useEditHistory<AudioSample>();
  const resetHistory = history.reset;
  const sample = history.present;
  const [savedSample, setSavedSample] = useState<AudioSample | null>(null);
  const sampleRef = useRef<AudioSample | null>(null);
  sampleRef.current = sample;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selection, setSelection] = useState<Selection | null>(null);
  const selectionRef = useRef<Selection | null>(null);
  selectionRef.current = selection;

  const [playhead] = useState(createPlayheadStore);

  const [isPlaying, setIsPlaying] = useState(false);
  const [loop, setLoop] = useState(false);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const [zoom, setZoom] = useState(1);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const playBufferRef = useRef<{
    sample: AudioSample;
    buffer: AudioBuffer;
  } | null>(null);
  const rafRef = useRef<number | null>(null);
  const startCtxTimeRef = useRef(0);
  const startOffsetRef = useRef(0);
  const endRef = useRef(0);

  const getUrlRef = useRef(asset.get_url);
  getUrlRef.current = asset.get_url;

  const { save: saveToAsset, saving: savingToAsset } =
    useSaveAudioToAsset(asset);
  const [savingCustom, setSavingCustom] = useState(false);
  const saving = savingToAsset || savingCustom;
  const save = useCallback(
    async (next: AudioSample): Promise<boolean> => {
      if (!onSaveSample) return saveToAsset(next);
      setSavingCustom(true);
      try {
        return await onSaveSample(next);
      } finally {
        setSavingCustom(false);
      }
    },
    [onSaveSample, saveToAsset]
  );
  const initialSelectionRef = useRef(initialSelection);

  const getCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      const Ctor = getAudioContextCtor();
      if (!Ctor) throw new Error(t("batch2_16.audio.webAudioUnavailable"));
      audioCtxRef.current = new Ctor();
    }
    return audioCtxRef.current;
  }, [t]);

  const teardownSource = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const src = sourceRef.current;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // already stopped
      }
      src.disconnect();
      sourceRef.current = null;
    }
  }, []);

  const play = useCallback(() => {
    const current = sampleRef.current;
    if (!current) return;
    const ctx = getCtx();
    void ctx.resume();
    teardownSource();

    const duration = sampleDuration(current);
    const sel = selectionRef.current;
    const useLoop = loopRef.current;
    const begin = Math.max(
      0,
      Math.min(sel ? sel.start : playhead.get(), duration)
    );
    const end = sel ? sel.end : duration;

    const src = ctx.createBufferSource();
    // Building the AudioBuffer copies every channel, so reuse it while the
    // sample is unchanged (replay, loop, seek-and-play).
    if (playBufferRef.current?.sample !== current) {
      playBufferRef.current = {
        sample: current,
        buffer: sampleToAudioBuffer(current, ctx)
      };
    }
    src.buffer = playBufferRef.current.buffer;
    src.connect(ctx.destination);
    if (useLoop) {
      src.loop = true;
      if (sel) {
        src.loopStart = sel.start;
        src.loopEnd = sel.end;
      }
    }

    startCtxTimeRef.current = ctx.currentTime;
    startOffsetRef.current = begin;
    endRef.current = end;
    src.start(0, begin, useLoop ? undefined : Math.max(0, end - begin));
    src.onended = () => {
      if (loopRef.current) return;
      teardownSource();
      setIsPlaying(false);
      playhead.set(selectionRef.current ? selectionRef.current.start : begin);
    };
    sourceRef.current = src;
    setIsPlaying(true);

    const tick = () => {
      const elapsed = getCtx().currentTime - startCtxTimeRef.current;
      let t = startOffsetRef.current + elapsed;
      const s = selectionRef.current;
      if (loopRef.current && s && s.end > s.start) {
        t = s.start + ((t - s.start) % (s.end - s.start));
      } else if (t > endRef.current) {
        t = endRef.current;
      }
      playhead.set(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [getCtx, teardownSource, playhead]);

  const pause = useCallback(() => {
    teardownSource();
    setIsPlaying(false);
  }, [teardownSource]);

  const stop = useCallback(() => {
    teardownSource();
    setIsPlaying(false);
    playhead.set(selectionRef.current ? selectionRef.current.start : 0);
  }, [teardownSource, playhead]);

  const togglePlay = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  useEffect(() => {
    if (active) {
      return;
    }
    pause();
    if (audioCtxRef.current) {
      void audioCtxRef.current.suspend();
    }
  }, [active, loading, pause]);

  useEffect(() => {
    useDocumentDraftStore
      .getState()
      .setDirty(`audio:${asset.id}`, sample !== null && sample !== savedSample);
  }, [asset.id, sample, savedSample]);

  useEffect(
    () => () => {
      useDocumentDraftStore.getState().setDirty(`audio:${asset.id}`, false);
    },
    [asset.id]
  );

  // Load + decode the asset once per identity. get_url changes after our own
  // save must not reload and wipe in-progress edits.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = resolveMediaUrl(getUrlRef.current);
    if (!url) {
      setError(t("batch2_16.audio.noUrl"));
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(t("batch2_16.audio.fetchFailed", { status: response.status }));
        }
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await getCtx().decodeAudioData(arrayBuffer);
        if (cancelled) return;
        const initial = audioBufferToSample(decoded);
        resetHistory(initial);
        setSavedSample(initial);
        const region = initialSelectionRef.current;
        const duration = sampleDuration(initial);
        if (region && region.end > region.start && region.start < duration) {
          setSelection({
            start: Math.max(0, region.start),
            end: Math.min(duration, region.end)
          });
        }
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id, getCtx, resetHistory, t]);

  // Stop playback and re-clamp selection/playhead whenever the sample changes
  // (edit, undo, or redo).
  useEffect(() => {
    if (!sample) return;
    teardownSource();
    setIsPlaying(false);
    const duration = sampleDuration(sample);
    setSelection((sel) => {
      if (!sel) return null;
      const start = Math.min(sel.start, duration);
      const end = Math.min(sel.end, duration);
      return end > start ? { start, end } : null;
    });
    if (playhead.get() > duration) {
      playhead.set(duration);
    }
  }, [sample, teardownSource, playhead]);

  useEffect(
    () => () => {
      teardownSource();
      if (audioCtxRef.current) {
        void audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    },
    [teardownSource]
  );

  // Element state (not a ref) so the observer attaches when the wave area
  // mounts — it only appears after loading finishes, past the mount effect.
  const [waveArea, setWaveArea] = useState<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    if (!waveArea) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(waveArea);
    return () => observer.disconnect();
  }, [waveArea]);

  const duration = sample ? sampleDuration(sample) : 0;
  const fitPps =
    duration > 0 && containerWidth > 0 ? containerWidth / duration : 100;
  const pixelsPerSecond = Math.max(1, fitPps * zoom);

  const hasSelection = !!selection && selection.end > selection.start;

  const commitEdit = useCallback(
    (fn: (s: AudioSample) => AudioSample) => {
      const current = sampleRef.current;
      if (!current) return;
      history.commit(fn(current));
    },
    [history]
  );

  const handleTrim = useCallback(() => {
    if (!selection) return;
    commitEdit((s) => cropToRange(s, selection.start, selection.end));
    setSelection(null);
    playhead.set(0);
  }, [selection, commitEdit, playhead]);

  const handleDelete = useCallback(() => {
    if (!selection) return;
    const start = selection.start;
    commitEdit((s) => deleteRange(s, selection.start, selection.end));
    setSelection(null);
    playhead.set(start);
  }, [selection, commitEdit, playhead]);

  const handleSilence = useCallback(() => {
    if (!selection) return;
    commitEdit((s) => silenceRange(s, selection.start, selection.end));
  }, [selection, commitEdit]);

  const handleFade = useCallback(
    (direction: "in" | "out") => {
      if (!selection) return;
      commitEdit((s) => fade(s, selection.start, selection.end, direction));
    },
    [selection, commitEdit]
  );

  const handleNormalize = useCallback(() => {
    commitEdit((s) => normalize(s, selection?.start, selection?.end));
  }, [selection, commitEdit]);

  const handleReverse = useCallback(() => {
    commitEdit((s) => reverseRange(s, selection?.start, selection?.end));
  }, [selection, commitEdit]);

  const handleGain = useCallback(
    (factor: number) => {
      commitEdit((s) => applyGain(s, factor, selection?.start, selection?.end));
    },
    [selection, commitEdit]
  );

  const handleFadeIn = useCallback(() => handleFade("in"), [handleFade]);
  const handleFadeOut = useCallback(() => handleFade("out"), [handleFade]);
  const handleAmplify = useCallback(() => handleGain(1.4), [handleGain]);
  const handleQuieten = useCallback(() => handleGain(0.7), [handleGain]);
  const handleToggleLoop = useCallback(() => setLoop((v) => !v), []);

  const [openEffect, setOpenEffect] = useState<AudioEffect | null>(null);
  // Last-used settings per effect, so reopening an effect keeps its values.
  const [effectParams, setEffectParams] = useState<
    Record<string, EffectParams>
  >({});
  const [effectError, setEffectError] = useState<string | null>(null);

  const runEffect = useCallback(
    async (effect: AudioEffect, params: EffectParams) => {
      const current = sampleRef.current;
      if (!current) return;
      const sel = selectionRef.current;
      const result = await applyEffect(
        current,
        effect,
        params,
        sel?.start,
        sel?.end
      );
      // Edits made while an async render ran win; drop this result.
      if (sampleRef.current !== current) return;
      history.commit(result);
      if (effect.changesLength) {
        setSelection(null);
      }
    },
    [history]
  );

  // An unedited sample runs as the asset itself; an edited one as the WAV the
  // editor would save. A returned clip replaces the sample as one undo step.
  const [transformSource, setTransformSource] = useState<TransformSource | null>(null);
  const handleTransform = useCallback(() => {
    const current = sampleRef.current;
    if (!current) return;
    const fromAsset = transformSourceFromAsset(asset);
    if (!fromAsset) return;
    setTransformSource(
      current === savedSample
        ? fromAsset
        : {
            ...fromAsset,
            assetId: undefined,
            uri: `data:audio/wav;base64,${arrayBufferToBase64(encodeWav(current))}`
          }
    );
  }, [asset, savedSample]);
  const transformApply = useMemo<TransformApplyAction>(
    () => ({
      label: t("transformWithWorkflow.apply.replaceAudio"),
      kinds: ["audio"],
      onApply: async (result) => {
        const url = await resolveMediaUri(result.uri);
        if (!url) {
          throw new Error(t("batch2_16.audio.noUrl"));
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(t("batch2_16.audio.fetchFailed", { status: response.status }));
        }
        const decoded = await getCtx().decodeAudioData(await response.arrayBuffer());
        history.commit(audioBufferToSample(decoded));
        setSelection(null);
      }
    }),
    [getCtx, history, t]
  );

  const handleApplyEffect = useCallback(
    async (effect: AudioEffect, params: EffectParams) => {
      setEffectParams((prev) => ({ ...prev, [effect.id]: params }));
      await runEffect(effect, params);
    },
    [runEffect]
  );

  const handleEffect = useCallback(
    (effectId: string) => {
      const effect = getAudioEffect(effectId);
      if (!effect) return;
      pause();
      setEffectError(null);
      if (effect.params.length > 0) {
        setOpenEffect(effect);
        return;
      }
      runEffect(effect, {}).catch((e: unknown) =>
        setEffectError(e instanceof Error ? e.message : String(e))
      );
    },
    [pause, runEffect]
  );

  const closeEffect = useCallback(() => setOpenEffect(null), []);

  const [saveFailed, setSaveFailed] = useState(false);
  const handleSave = useCallback(async () => {
    const savingSample = sampleRef.current;
    if (!savingSample) return;
    const saved = await save(savingSample);
    setSaveFailed(!saved);
    if (saved) setSavedSample(savingSample);
  }, [save]);

  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(MAX_ZOOM, z * ZOOM_STEP)),
    []
  );
  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(MIN_ZOOM, z / ZOOM_STEP)),
    []
  );
  const zoomFit = useCallback(() => setZoom(1), []);

  const ready = !loading && !error && !!sample;

  const savedSampleRef = useRef(savedSample);
  savedSampleRef.current = savedSample;
  const commitHistory = history.commit;
  const assetId = asset.id;
  const assetName = asset.name;
  useEffect(() => {
    if (!serveAgentTools || !ready) return;
    const current = (): AudioSample => {
      const value = sampleRef.current;
      if (!value) throw new Error("The audio is not loaded yet.");
      return value;
    };
    const snapshot = (): AudioSnapshot => {
      const value = current();
      const { peaks, windowSeconds } = summarizePeaks(value);
      const sel = selectionRef.current;
      return {
        assetId,
        name: assetName,
        durationSeconds: sampleDuration(value),
        sampleRate: value.sampleRate,
        channels: value.channels.length,
        dirty: value !== savedSampleRef.current,
        selection: sel && sel.end > sel.start ? { ...sel } : null,
        peaks,
        peakWindowSeconds: windowSeconds
      };
    };
    // Tool calls in one turn can outrun a render, so the ref moves with the
    // commit instead of waiting for it.
    const commit = (next: AudioSample) => {
      if (next === sampleRef.current) return;
      commitHistory(next);
      sampleRef.current = next;
    };
    const handler: AudioAgentHandler = {
      getSnapshot: snapshot,
      edit: (op, range, gainDb) => {
        commit(applyAudioEdit(current(), op, range, gainDb));
        if (op === "trim" || op === "delete") {
          setSelection(null);
          selectionRef.current = null;
          playhead.set(op === "trim" ? 0 : (range?.start ?? 0));
        }
        return snapshot();
      },
      applyEffect: async (effectId, params, range) => {
        const checked = validateAudioEffectParams(effectId, params);
        const effect = getAudioEffect(checked.effect.id);
        if (!effect) {
          throw new Error(`The editor cannot render "${effectId}".`);
        }
        const before = current();
        const result = await applyEffect(
          before,
          effect,
          checked.params,
          range?.start,
          range?.end
        );
        if (sampleRef.current !== before) {
          throw new Error(
            "The audio changed while the effect rendered, so the result was dropped. Read it again with ui_audio_get_state and retry."
          );
        }
        commit(result);
        if (effect.changesLength) {
          setSelection(null);
          selectionRef.current = null;
        }
        return snapshot();
      },
      save: async () => {
        const value = current();
        if (value !== savedSampleRef.current) {
          const saved = await save(value);
          setSaveFailed(!saved);
          if (!saved) {
            throw new Error("Saving the audio failed. The edits are still in the editor.");
          }
          setSavedSample(value);
          savedSampleRef.current = value;
        }
        return snapshot();
      }
    };
    setAudioAgentHandler(assetId, handler);
    return () => setAudioAgentHandler(assetId, null);
  }, [serveAgentTools, ready, assetId, assetName, commitHistory, save, playhead]);
  const bar = documentBar?.(
    ready
      ? {
          status: (
            <SaveStatus
              state={explicitSaveStatus({
                saving,
                dirty: sample !== savedSample,
                failed: saveFailed
              })}
              onRetry={() => void handleSave()}
            />
          ),
          history: (
            <UndoRedoButtons
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onUndo={history.undo}
              onRedo={history.redo}
            />
          ),
          actions: (
            <>
              <DocumentSaveButton
                onSave={() => void handleSave()}
                saving={saving}
                disabled={sample === savedSample}
              />
              <DocumentMoreMenu
                items={(close) => [
                  <MenuItemPrimitive
                    key="transform"
                    label={t("transformWithWorkflow.open")}
                    icon={<AutoFixHighOutlinedIcon fontSize="small" />}
                    onClick={() => {
                      close();
                      handleTransform();
                    }}
                  />
                ]}
              />
            </>
          )
        }
      : {}
  );

  if (loading) {
    return (
      <FlexColumn fullWidth fullHeight>
        {bar}
        <FlexColumn fullWidth fullHeight align="center" justify="center">
          <LoadingSpinner />
        </FlexColumn>
      </FlexColumn>
    );
  }

  if (error || !sample) {
    return (
      <FlexColumn fullWidth fullHeight>
        {bar}
        <FlexColumn fullWidth fullHeight align="center" justify="center">
          <EmptyState
            variant="error"
            title={t("batch2_16.audio.couldNotOpen")}
            description={error ?? t("batch2_16.audio.decodeFailed")}
            actionText={onClose ? t("batch2_16.audio.done") : undefined}
            onAction={onClose}
          />
        </FlexColumn>
      </FlexColumn>
    );
  }

  const statusText = hasSelection && selection
    ? t("batch2_16.audio.selection", {
        start: formatEditorTime(selection.start),
        end: formatEditorTime(selection.end),
        duration: formatEditorTime(selection.end - selection.start)
      })
    : t("batch2_16.audio.dragHint");
  const status = effectError ? (
    <FlexRow align="center" gap={SPACING.xs} sx={{ minWidth: 0 }}>
      <TruncatedText
        showTooltip
        color="error.main"
        sx={TYPOGRAPHY.sans.caption}
      >
        {effectError}
      </TruncatedText>
      <ReportBugButton
        context={{
          source: "operation-failure",
          summary: t("batch2_16.audio.effectFailed"),
          errorText: effectError
        }}
      />
    </FlexRow>
  ) : (
    <TruncatedText color="text.secondary" sx={TYPOGRAPHY.sans.caption}>
      {statusText}
    </TruncatedText>
  );

  return (
    <FlexColumn fullWidth fullHeight sx={{ overflow: "hidden" }}>
      {bar}
      <AudioEditorToolbar
        hasSelection={hasSelection}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        saving={saving}
        canSave={!loading && !error}
        onTrim={handleTrim}
        onDelete={handleDelete}
        onSilence={handleSilence}
        onFadeIn={handleFadeIn}
        onFadeOut={handleFadeOut}
        onNormalize={handleNormalize}
        onAmplify={handleAmplify}
        onQuieten={handleQuieten}
        onReverse={handleReverse}
        onEffect={handleEffect}
        onTransform={documentBar ? undefined : handleTransform}
        onUndo={documentBar ? undefined : history.undo}
        onRedo={documentBar ? undefined : history.redo}
        onSave={documentBar ? undefined : handleSave}
        onDone={documentBar ? undefined : onClose}
      />

      <Box
        ref={setWaveArea}
        sx={{ flex: 1, minHeight: 0, position: "relative" }}
      >
        <WaveformView
          sample={sample}
          pixelsPerSecond={pixelsPerSecond}
          selection={selection}
          playhead={playhead}
          onSelectionChange={setSelection}
          onSeek={playhead.set}
        />
      </Box>

      <AudioTransportBar
        isPlaying={isPlaying}
        loop={loop}
        playhead={playhead}
        duration={duration}
        zoom={zoom}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        status={status}
        onTogglePlay={togglePlay}
        onStop={stop}
        onToggleLoop={handleToggleLoop}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomFit={zoomFit}
        onZoomChange={setZoom}
      />

      {openEffect && (
        <AudioEffectDialog
          key={openEffect.id}
          effect={openEffect}
          sample={sample}
          selection={hasSelection ? selection : null}
          initialParams={
            effectParams[openEffect.id] ?? defaultEffectParams(openEffect)
          }
          getAudioContext={getCtx}
          onApply={handleApplyEffect}
          onClose={closeEffect}
        />
      )}

      {transformSource && (
        <TransformWithWorkflowView
          source={transformSource}
          onClose={() => setTransformSource(null)}
          apply={transformApply}
        />
      )}
    </FlexColumn>
  );
};

export default AudioSampleEditor;
