interface GamePlayStatusInput {
  won: boolean;
  playing: boolean;
  /** A run exists but is paused. */
  paused: boolean;
  /** The scene the run is on, by its document name. */
  sceneName: string | undefined;
  sceneCount: number;
}

/**
 * The state word in a game player's header. While a game with several scenes
 * runs, it names the current scene, so a title screen waiting for a key reads
 * "Scene: Title" rather than claiming the level is being played.
 */
export const gamePlayStatus = ({
  won,
  playing,
  paused,
  sceneName,
  sceneCount
}: GamePlayStatusInput): string => {
  if (won) {
    return "Won";
  }
  if (playing) {
    return sceneCount > 1 && sceneName ? `Scene: ${sceneName}` : "Playing";
  }
  return paused ? "Paused" : "Ready";
};
