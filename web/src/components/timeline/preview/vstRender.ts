/**
 * vstRender — note events through a VST3 instrument, as a stereo AudioBuffer.
 *
 * The desktop app's helper process renders the plug-in offline (see
 * `daw/devices/vstBridge.ts`); the buffer then joins the ordinary pre-rendered
 * midi path, so clip gain, fades, the track chain and the export treat it like
 * any other render. The browser build has no host and rejects with a message
 * the device view and the export show.
 */

import type { VoiceEvent, VstMidiInstrument } from "@nodetool-ai/timeline";
import { vstBridge } from "../daw/devices/vstBridge";
import { dbToGain } from "./AudioGraph";

export const VST_DESKTOP_ONLY =
  "VST instruments play in the NodeTool desktop app.";
export const VST_NO_PLUGIN = "Choose a VST instrument for this track.";

export async function renderVstBuffer(
  ctx: BaseAudioContext,
  instrument: VstMidiInstrument,
  events: ReadonlyArray<VoiceEvent>,
  frames: number
): Promise<AudioBuffer> {
  const bridge = vstBridge();
  if (!bridge) throw new Error(VST_DESKTOP_ONLY);
  if (!instrument.plugin) throw new Error(VST_NO_PLUGIN);
  const length = Math.max(1, Math.round(frames));
  const result = await bridge.render({
    plugin: { path: instrument.plugin.path, uid: instrument.plugin.uid },
    state: instrument.state,
    sampleRate: ctx.sampleRate,
    frames: length,
    events: events.map((e) => ({
      pitch: e.pitch,
      velocity: e.velocity,
      startFrame: e.startFrame,
      gateOffFrame: e.gateOffFrame
    }))
  });
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const gain = dbToGain(instrument.gainDb);
  for (let ch = 0; ch < 2; ch++) {
    const channel = result.pcm.subarray(ch * result.frames, (ch + 1) * result.frames);
    const out = buffer.getChannelData(ch);
    const n = Math.min(out.length, channel.length);
    for (let i = 0; i < n; i++) out[i] = channel[i] * gain;
  }
  return buffer;
}
