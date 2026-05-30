import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import { VOICE_ID_MAP, VOICE_NAMES } from "../elevenlabs-base.js";

export class StandardVoiceNode extends BaseNode {
  static readonly nodeType = "elevenlabs.StandardVoice";
  static readonly body = "small";
  static readonly title = "Standard Voice";
  static readonly description =
    "Select a standard ElevenLabs voice and output its voice ID.\n" +
    "audio, tts, speech, voice, voice-id, elevenlabs\n\n" +
    "Use cases:\n" +
    "- Pick a built-in ElevenLabs voice by name\n" +
    "- Feed a voice ID into text-to-speech nodes\n" +
    "- Reuse the same voice across a workflow";
  static readonly metadataOutputTypes = { voice_id: "str" };
  static readonly inlineFields: string[] = ["voice"];
  static readonly inputFields: string[] = [];

  @prop({
    type: "enum",
    default: "Aria",
    title: "Voice",
    description: "Standard ElevenLabs voice to use.",
    values: VOICE_NAMES
  })
  declare voice: any;

  async process(): Promise<Record<string, unknown>> {
    const voice = String(this.voice ?? "Aria");
    const voiceId = VOICE_ID_MAP[voice];
    if (!voiceId) throw new Error(`Unknown voice: ${voice}`);

    return { voice_id: voiceId };
  }
}

export const STANDARD_VOICE_NODES: readonly NodeClass[] = [StandardVoiceNode];
