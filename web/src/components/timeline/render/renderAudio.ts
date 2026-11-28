/**
 * renderTimelineAudio — offline mixdown of the timeline's audio and midi tracks,
 * and of the video clips that carry their own audio.
 *
 * Reuses {@link AudioGraph} (the same clip scheduling, fades, speed, per-clip
 * gain, track mute/solo and DSP chain the live preview uses) but drives it with
 * an `OfflineAudioContext`, so the exported soundtrack matches what playback
 * produced — 1:1 with live.
 */

import {
  DEFAULT_MIDI_INSTRUMENT,
  effectiveAssetId,
  applyAutoCrossfade,
  autoCrossfadeMsOf,
  harmonizeClips,
  instrumentCutoffControls,
  mergeTrackMidiControllers,
  midiClipFrames,
  midiClipVoiceEvents,
  renderMidiClip,
  resolveTempo,
  tracksWithPatternAutomation,
  videoClipsWithOwnAudio
} from "@nodetool-ai/timeline";
import type {
  TimelineClip,
  TimelineMasterChannel,
  TimelineMusic,
  TimelineTempo,
  TimelineTrack
} from "@nodetool-ai/timeline";
import { getSamplerAudio } from "../preview/samplerAudio";
import { renderVstBuffer } from "../preview/vstRender";
import { AudioGraph, type ScheduledAudioClip } from "../preview/AudioGraph";
import { liveDeviceFactory } from "../daw/devices/liveDevice";
import "../daw/devices/registerFablesynthDevices";
import { preloadFableFx, usesFableFx } from "../daw/fx/fableFxUnit";

interface RenderAudioOptions {
  clips: TimelineClip[];
  tracks: TimelineTrack[];
  /** Total timeline length to render, in milliseconds. */
  durationMs: number;
  /** Resolve an asset id to a playable URL (or undefined when unavailable). */
  resolveUrl: (assetId: string) => Promise<string | undefined>;
  /** Output sample rate. Defaults to 48 kHz. */
  sampleRate?: number;
  /** Tempo the midi clips are read against. Defaults to `DEFAULT_TEMPO`. */
  tempo?: TimelineTempo;
  /** The document's music marker. A music project crossfades touching audio clips (CE7). */
  music?: TimelineMusic;
  /** The document's master channel: its inserts and fader run on the mix. */
  master?: TimelineMasterChannel;
  /** Aborts the mixdown between steps and while assets are loading. */
  signal?: AbortSignal;
}

function abortError(): DOMException {
  return new DOMException("Render aborted", "AbortError");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

/** Settle with `promise`, or reject with an AbortError as soon as `signal` fires. */
function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    // The loser must not become an unhandled rejection.
    promise.catch(() => undefined);
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

function isPlayableAudioClip(clip: TimelineClip): boolean {
  if (clip.muted || clip.startMs + clip.durationMs <= 0) return false;
  // A midi clip's notes or controller lanes are its content: no asset to fetch.
  if (clip.mediaType === "midi") {
    return (
      (clip.notes?.length ?? 0) > 0 || (clip.controllers?.length ?? 0) > 0
    );
  }
  return clip.mediaType === "audio" && effectiveAssetId(clip) !== undefined;
}

/**
 * Render every audible clip into a single stereo {@link AudioBuffer}, or
 * `null` when the timeline has no usable audio.
 */
export async function renderTimelineAudio(
  opts: RenderAudioOptions
): Promise<AudioBuffer | null> {
  const { tracks, durationMs, resolveUrl, signal } = opts;
  const effectiveTracks = tracksWithPatternAutomation(tracks, opts.clips, {
    tracks,
    tempo: opts.tempo
  });
  const tempo = resolveTempo({ tempo: opts.tempo });
  const instrumentOf = (trackId: string) =>
    tracks.find((t) => t.id === trackId)?.instrument ?? DEFAULT_MIDI_INSTRUMENT;
  // A midi clip with `harmony` plays its arp or comp expansion, here and in
  // what the live devices are preloaded with. Pre-rendered tracks also merge
  // overlapping same-track controller clips onto note-bearing clips.
  const clips = mergeTrackMidiControllers(
    harmonizeClips(opts.clips, { tracks, tempo: opts.tempo }),
    tempo,
    { shouldMergeTrack: (trackId) => !liveDeviceFactory(instrumentOf(trackId)) }
  );
  const sampleRate = opts.sampleRate ?? 48_000;

  if (durationMs <= 0) return null;
  throwIfAborted(signal);

  // Midi tracks are mixed with the audio ones — same gain, mute/solo and DSP
  // chain — so the export hears the synth parts the preview plays.
  const audioTracks = tracks.filter(
    (track) => track.type === "audio" || track.type === "midi"
  );
  const hasSolo = audioTracks.some((track) => track.solo);
  const audibleTrackIds = new Set(
    audioTracks
      .filter((track) => !track.muted && (!hasSolo || track.solo))
      .map((track) => track.id)
  );
  // A video clip with no extracted-audio partner sounds its own audio, as it
  // does in the server export; its mute and solo are decided by the shared rule.
  const audioClips = applyAutoCrossfade([
    ...videoClipsWithOwnAudio(clips, tracks).filter(
      (clip) => clip.startMs + clip.durationMs > 0
    ),
    ...clips.filter(
      (clip) => isPlayableAudioClip(clip) && audibleTrackIds.has(clip.trackId)
    )
  ], autoCrossfadeMsOf({ music: opts.music })) as TimelineClip[];
  if (audioClips.length === 0) return null;

  const length = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const offline = new OfflineAudioContext(2, length, sampleRate);
  const { bpm, offsetMs: gridOffsetMs } = tempo;

  const resolved = await abortable(
    Promise.all(
      audioClips.map(async (clip): Promise<ScheduledAudioClip | null> => {
        throwIfAborted(signal);
        if (clip.mediaType === "midi" && liveDeviceFactory(instrumentOf(clip.trackId))) {
          return { clip, live: { bpm, gridOffsetMs } };
        }
        if (clip.mediaType === "midi") {
          const instrument = instrumentOf(clip.trackId);
          if (instrument.type === "vst") {
            // The desktop host renders the plug-in; without one this throws
            // rather than exporting the track as silence.
            const buffer = await renderVstBuffer(
              offline,
              instrument,
              midiClipVoiceEvents(clip, bpm, sampleRate, gridOffsetMs, instrument),
              midiClipFrames(clip, sampleRate)
            ).catch((error: unknown) => {
              throw new Error(
                `Cannot export the VST instrument track: ${error instanceof Error ? error.message : String(error)}`
              );
            });
            throwIfAborted(signal);
            return { clip, buffer };
          }
          // Rendered inline: the export already runs off the main thread's hot
          // path, and one context per render makes a worker round trip pure cost.
          const recordings = await getSamplerAudio(
            offline,
            instrument,
            resolveUrl
          );
          // A cancelled export has already returned; do not render the notes.
          throwIfAborted(signal);
          const track = effectiveTracks.find((t) => t.id === clip.trackId);
          const controls =
            instrument.type === "subtractive"
              ? instrumentCutoffControls(track, clip, sampleRate)
              : undefined;
          const samples = renderMidiClip({
            clip,
            bpm,
            gridOffsetMs,
            instrument,
            samples: recordings,
            controls,
            sampleRate
          });
          const buffer = offline.createBuffer(
            1,
            Math.max(1, samples.length),
            sampleRate
          );
          buffer.getChannelData(0).set(samples);
          return { clip, buffer };
        }
        const url = await resolveUrl(clip.currentAssetId!);
        return url ? { clip, assetUrl: url } : null;
      })
    ),
    signal
  );
  throwIfAborted(signal);
  const validClips = resolved.filter(
    (c): c is ScheduledAudioClip => c !== null
  );
  if (validClips.length === 0) return null;

  // FableSynth inserts are worklets: load the module before the graph builds
  // its chains, so they are spliced in at build time and render from frame 0.
  if (usesFableFx(tracks, opts.master)) {
    await abortable(preloadFableFx(offline), signal);
  }
  // The graph's fetches take the export's signal, and a cancel stops it
  // scheduling once its buffers settle, so a cancelled mix stops downloading
  // and decoding rather than finishing behind the next export.
  const graph = new AudioGraph(offline, { signal });
  graph.setTempo(bpm);
  graph.setMaster(opts.master);
  // Live devices get their whole score at construction: an offline render
  // can finish before a message posted after it starts is delivered.
  await abortable(
    graph.preloadLiveDevices(
      effectiveTracks.filter((track) => audibleTrackIds.has(track.id)),
      audioClips,
      bpm,
      gridOffsetMs
    ),
    signal
  );
  // currentTimeMs = 0: the renderer always mixes the whole timeline from t=0,
  // so each clip is scheduled at its absolute startMs on the offline clock.
  await abortable(
    graph.scheduleClips(
      validClips,
      effectiveTracks,
      0,
      () => signal?.aborted === true
    ),
    signal
  );
  throwIfAborted(signal);

  return abortable(offline.startRendering(), signal);
}
