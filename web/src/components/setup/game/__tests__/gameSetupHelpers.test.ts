/**
 * The small rules the Game flow's steps gate on: what a design must hold
 * before the build may read it, how a stored image model id round-trips, and
 * which style a build pastes into its prompts.
 */
import {
  NATIVE_GAME_INSPIRATION_CHIPS,
  findNativeGameTemplate
} from "@nodetool-ai/protocol";

import {
  describeGameSlot,
  gameDesignGaps,
  gameStyleChoice,
  imageModelTileId,
  parseImageModelTileId
} from "../gameSetupModel";

const slots = findNativeGameTemplate("topdown")!.manifest.slots;
const design = NATIVE_GAME_INSPIRATION_CHIPS[0]!.design;

describe("gameDesignGaps", () => {
  it("finds nothing missing in a shipped design", () => {
    expect(gameDesignGaps(design, slots)).toEqual([]);
  });

  it("names a blank title, a blank look and a blank art subject", () => {
    const gaps = gameDesignGaps(
      {
        ...design,
        title: " ",
        cast: design.cast.map((member, index) =>
          index === 0 ? { ...member, descriptor: "" } : member
        ),
        slot_prompts: design.slot_prompts.filter(
          (entry) => entry.slot_id !== "wall"
        )
      },
      slots
    );
    expect(gaps).toEqual([
      "a title",
      "how Bramble looks",
      "what the wall art shows"
    ]);
  });

  it("does not ask for a sound subject, since sounds keep the template's", () => {
    expect(
      gameDesignGaps(
        {
          ...design,
          slot_prompts: design.slot_prompts.filter(
            (entry) => entry.slot_id !== "sfx.collect"
          )
        },
        slots
      )
    ).toEqual([]);
  });
});

describe("image model tile ids", () => {
  it("round-trips a provider and a model id that holds a colon", () => {
    const model = { provider: "ollama", id: "flux:schnell" };
    expect(parseImageModelTileId(imageModelTileId(model))).toEqual(model);
  });

  it("reads nothing from an absent or malformed id", () => {
    expect(parseImageModelTileId(undefined)).toBeNull();
    expect(parseImageModelTileId("no-separator")).toBeNull();
    expect(parseImageModelTileId(":id")).toBeNull();
  });
});

describe("describeGameSlot", () => {
  it("says what each slot of the top-down template is", () => {
    expect(slots.map(describeGameSlot)).toEqual([
      "player: 32×32 sprite, idle, walk (4 frames)",
      "wall: 32×32 tile",
      "gem: 32×32 sprite, idle",
      "sfx.collect: sound effect"
    ]);
  });
});

describe("gameStyleChoice", () => {
  const presets = [
    {
      entityId: "e1",
      presetId: "pixel-8bit",
      name: "8-bit",
      descriptor: "8-bit pixel art",
      thumbnail: "package://x.png"
    }
  ];

  it("uses the picked preset's name and descriptor", () => {
    expect(gameStyleChoice(presets, "e1")).toEqual({
      name: "8-bit",
      descriptor: "8-bit pixel art"
    });
  });

  it("draws with no style for an id no preset has", () => {
    expect(gameStyleChoice(presets, "no-style")).toBeNull();
  });
});
