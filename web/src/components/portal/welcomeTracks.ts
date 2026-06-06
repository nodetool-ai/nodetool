/**
 * Starter tracks for the dashboard welcome flow. Each track maps a creative
 * modality to a real three-node starter graph (String -> model node ->
 * Preview) that is dropped onto the canvas when the user picks it.
 *
 * Node type strings, input handles, and output handles are the canonical
 * `nodetool.*` node identifiers (see packages/dsl/src/generated). The model
 * field on each model node is filled with the user's default model at
 * creation time via applyDefaultModels — these tracks intentionally do not
 * hardcode a provider.
 */
export type WelcomeTrackId = "image" | "video" | "audio" | "agent";

export interface WelcomeTrack {
  id: WelcomeTrackId;
  /** Card title. */
  label: string;
  /** One-line description under the title. */
  blurb: string;
  /** Short node-type label shown as a mono chip on the card. */
  nodeLabel: string;
  /** Modality accent color used for the card icon tint. */
  accent: string;
  /** Name given to the created workflow. */
  workflowName: string;
  /** Example prompt pre-filled into the String node. */
  samplePrompt: string;
  /** Node type of the model node wired after the String. */
  modelType: string;
  /** Input handle on the model node that receives the prompt String. */
  promptInput: string;
  /** Output handle on the model node that feeds the Preview. */
  outputHandle: string;
}

export {
  STRING_NODE_TYPE,
  PREVIEW_NODE_TYPE
} from "../../constants/nodeTypes";

export const WELCOME_TRACKS: WelcomeTrack[] = [
  {
    id: "image",
    label: "Image",
    blurb: "A still frame from a prompt.",
    nodeLabel: "TextToImage",
    accent: "#9F7AEA",
    workflowName: "Image starter",
    samplePrompt:
      "a brutalist concrete pavilion at dusk, fog rolling in low, single warm light from inside, photograph, medium format",
    modelType: "nodetool.image.TextToImage",
    promptInput: "prompt",
    outputHandle: "output"
  },
  {
    id: "video",
    label: "Video",
    blurb: "A short clip from a prompt.",
    nodeLabel: "TextToVideo",
    accent: "#F472B6",
    workflowName: "Video starter",
    samplePrompt:
      "slow dolly through an empty library at golden hour, dust in the air, 24fps, cinematic",
    modelType: "nodetool.video.TextToVideo",
    promptInput: "prompt",
    outputHandle: "output"
  },
  {
    id: "audio",
    label: "Audio",
    blurb: "A spoken line or sound texture.",
    nodeLabel: "TextToSpeech",
    accent: "#FBBF24",
    workflowName: "Audio starter",
    samplePrompt:
      "a calm narrator: you are listening to nodetool. every model, your keys, your canvas.",
    modelType: "nodetool.audio.TextToSpeech",
    promptInput: "text",
    outputHandle: "audio"
  },
  {
    id: "agent",
    label: "Text · Agent",
    blurb: "A reasoning step or written output.",
    nodeLabel: "Agent",
    accent: "#60A5FA",
    workflowName: "Agent starter",
    samplePrompt:
      "draft a 4-line tagline for a creative tool that runs every AI model locally or in the cloud, no hype words",
    modelType: "nodetool.agents.Agent",
    promptInput: "prompt",
    outputHandle: "text"
  }
];
