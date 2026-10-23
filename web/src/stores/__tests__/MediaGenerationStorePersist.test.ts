/**
 * The mode is not kept across reloads: a new chat starts in Chat unless it was
 * opened in another mode. The per-mode parameters are still kept.
 */
import useMediaGenerationStore from "../MediaGenerationStore";

describe("MediaGenerationStore persistence", () => {
  it("keeps the mode parameters but not the mode", async () => {
    const { persist } = useMediaGenerationStore;
    const options = persist.getOptions();
    useMediaGenerationStore.getState().setMode("video");
    useMediaGenerationStore.getState().setVideoParams({ duration: 4 });

    const saved = options.partialize?.(useMediaGenerationStore.getState()) as
      Record<string, unknown>;
    expect(saved).not.toHaveProperty("mode");
    expect(saved.video).toMatchObject({ duration: 4 });

    // A mode saved before it stopped being kept is dropped on load.
    const migrated = (await options.migrate?.(
      { mode: "video", music: { model: null, duration: 10 } },
      3
    )) as Record<string, unknown>;
    expect(migrated).not.toHaveProperty("mode");
    expect(migrated.music).toEqual({ model: null, duration: 10 });
  });
});
