import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import { DEFAULT_VOICE, MINIMAX_VOICES } from "../minimax-base.js";

export class MinimaxVoiceNode extends BaseNode {
  static readonly nodeType = "minimax.Voice";
  static readonly body = "small";
  static readonly title = "MiniMax Voice";
  static readonly description =
    "Select a MiniMax system voice and output its voice ID.\n" +
    "audio, tts, speech, voice, voice-id, minimax\n\n" +
    "Use cases:\n" +
    "- Pick a built-in MiniMax voice by name\n" +
    "- Feed a voice ID into the MiniMax Text to Speech node\n" +
    "- Reuse the same voice across a workflow";
  static readonly metadataOutputTypes = { voice_id: "str" };
  static readonly inlineFields: string[] = ["voice"];
  static readonly inputFields: string[] = [];

  @prop({
    type: "enum",
    default: DEFAULT_VOICE,
    title: "Voice",
    description: "MiniMax system voice to use.",
    values: MINIMAX_VOICES
  })
  declare voice: any;

  async process(): Promise<Record<string, unknown>> {
    const voice = String(this.voice ?? DEFAULT_VOICE);
    return { voice_id: voice };
  }
}

export const VOICE_NODES: readonly NodeClass[] = [MinimaxVoiceNode];
