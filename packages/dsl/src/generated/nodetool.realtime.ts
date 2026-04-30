// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Video Sink — nodetool.realtime.VideoSink
// Send live video frames to the realtime preview or to an output transport.
// Tags: realtime, video, sink, preview, output, transport
export interface VideoSinkInputs {
  frame?: Connectable<unknown>;
}

export interface VideoSinkOutputs {
  frame: unknown;
}

export function videoSink(inputs: VideoSinkInputs): DslNode<VideoSinkOutputs, "frame"> {
  return createNode("nodetool.realtime.VideoSink", inputs as Record<string, unknown>, { outputNames: ["frame"], defaultOutput: "frame" });
}

// Video Passthrough — nodetool.realtime.VideoPassthrough
// Show the live camera feed through the realtime graph unchanged so routing and preview can be checked before loading a model.
// Tags: realtime, video, passthrough, camera, preview, routing, baseline
export interface VideoPassthroughInputs {
  frame?: Connectable<unknown>;
}

export interface VideoPassthroughOutputs {
  frame: unknown;
}

export function videoPassthrough(inputs: VideoPassthroughInputs): DslNode<VideoPassthroughOutputs, "frame"> {
  return createNode("nodetool.realtime.VideoPassthrough", inputs as Record<string, unknown>, { outputNames: ["frame"], defaultOutput: "frame", streaming: true });
}

// Audio Source — nodetool.realtime.AudioSource
// Receive live audio from a realtime session so it can feed audio-processing or output nodes.
// Tags: realtime, audio, source, microphone, input, PCM
export interface AudioSourceInputs {
  name?: Connectable<string>;
  frame?: Connectable<unknown>;
}

export interface AudioSourceOutputs {
  frame: unknown;
}

export function audioSource(inputs: AudioSourceInputs): DslNode<AudioSourceOutputs, "frame"> {
  return createNode("nodetool.realtime.AudioSource", inputs as Record<string, unknown>, { outputNames: ["frame"], defaultOutput: "frame", streaming: true });
}

// Audio Sink — nodetool.realtime.AudioSink
// Send live audio frames to a realtime output transport for playback or streaming.
// Tags: realtime, audio, sink, output, playback, streaming, PCM
export interface AudioSinkInputs {
  frame?: Connectable<unknown>;
}

export interface AudioSinkOutputs {
  frame: unknown;
}

export function audioSink(inputs: AudioSinkInputs): DslNode<AudioSinkOutputs, "frame"> {
  return createNode("nodetool.realtime.AudioSink", inputs as Record<string, unknown>, { outputNames: ["frame"], defaultOutput: "frame" });
}

// Realtime Parameter — nodetool.realtime.Parameter
// Expose a live control value that can be changed while a realtime workflow is running.
// Tags: realtime, parameter, control, live-update, automation, UI
export interface ParameterInputs {
  name?: Connectable<string>;
  value?: Connectable<unknown>;
  description?: Connectable<string>;
}

export interface ParameterOutputs {
  value: unknown;
}

export function parameter(inputs: ParameterInputs): DslNode<ParameterOutputs, "value"> {
  return createNode("nodetool.realtime.Parameter", inputs as Record<string, unknown>, { outputNames: ["value"], defaultOutput: "value" });
}

// Realtime Session Info — nodetool.realtime.SessionInfo
// Output the active realtime session details, including parameters, media tracks, transport, and metrics.
// Tags: realtime, session, metadata, metrics, diagnostics, media-tracks
export interface SessionInfoInputs {
}

export interface SessionInfoOutputs {
  session: Record<string, unknown>;
  session_id: string;
  workflow_id: string;
  transport: string;
  parameters: Record<string, unknown>;
  media_tracks: Record<string, unknown>[];
  metrics: Record<string, unknown>;
}

export function sessionInfo(inputs?: SessionInfoInputs): DslNode<SessionInfoOutputs> {
  return createNode("nodetool.realtime.SessionInfo", (inputs ?? {}) as Record<string, unknown>, { outputNames: ["session", "session_id", "workflow_id", "transport", "parameters", "media_tracks", "metrics"] });
}
