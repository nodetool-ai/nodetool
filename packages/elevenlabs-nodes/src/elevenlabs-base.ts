import type { EndpointCallResult, ProcessingContext } from "@nodetool-ai/runtime";

/** The PROVIDER_IDS value of the runtime ElevenLabs provider. */
export const ELEVENLABS_PROVIDER_ID = "elevenlabs";

type EndpointCall = Parameters<ProcessingContext["callProviderEndpoint"]>[0];

/**
 * Call an ElevenLabs REST endpoint through the runtime provider, inside the
 * generation seam. The provider holds the API key. See
 * `ElevenLabsProvider.callEndpoint` for the routes and their input shapes.
 */
export async function callElevenLabs(
  context: ProcessingContext | undefined,
  call: Omit<EndpointCall, "provider">
): Promise<EndpointCallResult> {
  if (!context) {
    throw new Error("ElevenLabs nodes need a processing context to run");
  }
  const request: EndpointCall = { ...call, provider: ELEVENLABS_PROVIDER_ID };
  // A node outside a graph run has no id. Record none rather than "".
  if (!request.nodeId) delete request.nodeId;
  return context.callProviderEndpoint(request);
}

export const VOICE_ID_MAP = {
  Aria: "9BWtsMINqrJLrRacOk9x",
  Roger: "CwhRBWXzGAHq8TQ4Fs17",
  Sarah: "EXAVITQu4vr4xnSDxMaL",
  Laura: "FGY2WhTYpPnrIDTdsKH5",
  Charlie: "IKne3meq5aSn9XLyUdCD",
  George: "JBFqnCBsd6RMkjVDRZzb",
  Callum: "N2lVS1w4EtoT3dr4eOWO",
  River: "SAz9YHcvj6GT2YYXdXww",
  Liam: "TX3LPaxmHKxFdv7VOQHJ",
  Charlotte: "XB0fDUnXU5powFXDhCwa",
  Alice: "Xb7hH8MSUJpSbSDYk0k2",
  Will: "bIHbv24MWmeRgasZH58o",
  Jessica: "cgSgspJ2msm6clMCkdW9",
  Eric: "cjVigY5qzO86Huf0OWal",
  Chris: "iP95p4xoKVk53GoZ742B",
  Brian: "nPczCjzI2devNBz1zQrb",
  Daniel: "onwK4e9ZLuTAKqWW03F9",
  Lily: "pFZP5JQG7iQjIQuC4Bku",
  Bill: "pqHfZKP75CvOlQylNhV4"
};

export const VOICE_NAMES = Object.keys(VOICE_ID_MAP);

const VOICE_IDS_BY_NAME = new Map(Object.entries(VOICE_ID_MAP));

/** The voice id for a standard voice name, or undefined when unknown. */
export function resolveVoiceId(name: string): string | undefined {
  return VOICE_IDS_BY_NAME.get(name);
}
