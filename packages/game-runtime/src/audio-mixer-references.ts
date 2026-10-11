import type { GameAudioSettings } from "@nodetool-ai/protocol";

export interface AudioMixerReferenceIssue {
  readonly path: (string | number)[];
  readonly message: string;
}

/** Checks the document references in `audio.mixer` that its schema cannot see: asset slots and scene ids. */
export function audioMixerReferenceIssues(audio: GameAudioSettings | undefined, assets: Readonly<Record<string, { readonly mediaKind: string }>>,
  sceneIds: ReadonlySet<string>): AudioMixerReferenceIssue[] {
  const mixer = audio?.mixer;
  if (!mixer) { return []; }
  const issues: AudioMixerReferenceIssue[] = [];
  for (const slot of Object.keys(mixer.assetBuses)) {
    const asset = assets[slot];
    if (!asset || asset.mediaKind !== "audio") {
      issues.push({ path: ["audio", "mixer", "assetBuses", slot], message: `Asset ${slot} must be an audio binding` });
    }
  }
  for (const [index, transition] of mixer.transitions.entries()) {
    if (transition.on.kind === "scene" && !sceneIds.has(transition.on.sceneId)) {
      issues.push({ path: ["audio", "mixer", "transitions", index, "on", "sceneId"], message: `Scene ${transition.on.sceneId} does not exist` });
    }
  }
  return issues;
}
