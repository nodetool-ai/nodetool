import { OPTIONAL_NODE_PACKS } from "../../config/optionalNodePacks";
import useOptionalNodePacksStore from "../OptionalNodePacksStore";

const reset = () =>
  useOptionalNodePacksStore.setState({ enabledPackIds: [] });

describe("OptionalNodePacksStore", () => {
  beforeEach(() => {
    reset();
    localStorage.clear();
  });

  it("starts with every optional pack hidden", () => {
    expect(useOptionalNodePacksStore.getState().enabledPackIds).toEqual([]);
  });

  it("enables and disables a pack", () => {
    const { setPackEnabled, isPackEnabled } =
      useOptionalNodePacksStore.getState();

    setPackEnabled("documents", true);
    expect(useOptionalNodePacksStore.getState().isPackEnabled("documents")).toBe(
      true
    );
    expect(isPackEnabled("imaging")).toBe(false);

    setPackEnabled("documents", false);
    expect(
      useOptionalNodePacksStore.getState().isPackEnabled("documents")
    ).toBe(false);
  });

  it("does not duplicate an already-enabled pack", () => {
    const { setPackEnabled } = useOptionalNodePacksStore.getState();
    setPackEnabled("web", true);
    setPackEnabled("web", true);
    expect(useOptionalNodePacksStore.getState().enabledPackIds).toEqual(["web"]);
  });

  it("toggles a pack", () => {
    const { togglePack } = useOptionalNodePacksStore.getState();
    togglePack("developer");
    expect(
      useOptionalNodePacksStore.getState().isPackEnabled("developer")
    ).toBe(true);
    togglePack("developer");
    expect(
      useOptionalNodePacksStore.getState().isPackEnabled("developer")
    ).toBe(false);
  });

  it("ignores unknown pack ids", () => {
    useOptionalNodePacksStore.getState().setPackEnabled("not-a-pack", true);
    expect(useOptionalNodePacksStore.getState().enabledPackIds).toEqual([]);
  });

  it("enables and disables all packs", () => {
    useOptionalNodePacksStore.getState().enableAll();
    expect(useOptionalNodePacksStore.getState().enabledPackIds).toHaveLength(
      OPTIONAL_NODE_PACKS.length
    );

    useOptionalNodePacksStore.getState().disableAll();
    expect(useOptionalNodePacksStore.getState().enabledPackIds).toEqual([]);
  });
});
