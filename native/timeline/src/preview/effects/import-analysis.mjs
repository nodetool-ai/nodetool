// Rebind only analysis that belongs to the exact media the fixture importer copied.
export function rebindAnalysisSource(clip, source) {
  return clip.effects?.map(effect => {
    const previous = effect.analysis?.source;
    if ((effect.type !== "deflicker" && effect.type !== "stabilize") || !previous || previous.assetId !== (clip.currentAssetId ?? "") ||
        previous.mediaPath !== (clip.mediaPath ?? "")) return effect;
    return {...effect, analysis: {...effect.analysis, source}};
  });
}
