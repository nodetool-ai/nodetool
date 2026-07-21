import { renderHook } from "@testing-library/react";
import { useAssetGridShortcuts } from "../useAssetGridShortcuts";
import { Asset } from "../../../stores/ApiTypes";

// Capture every useCombo registration so tests can assert the active flags and
// invoke the callbacks directly, without wiring the real global key bus.
type Registration = {
  combo: string[];
  callback: () => void;
  active: boolean;
};
let registrations: Registration[] = [];

jest.mock("../../../stores/KeyPressedStore", () => ({
  useCombo: (
    combo: string[],
    callback: () => void,
    _preventDefault?: boolean,
    active?: boolean
  ) => {
    registrations.push({ combo, callback, active: active ?? true });
  }
}));

jest.mock("zustand/react/shallow", () => ({
  useShallow: (selector: unknown) => selector
}));

const storeState = {
  selectedAssetIds: [] as string[],
  setSelectedAssetIds: jest.fn(),
  setSelectedAssets: jest.fn(),
  setDeleteDialogOpen: jest.fn(),
  openAsset: null as Asset | null,
  deleteDialogOpen: false,
  renameDialogOpen: false,
  moveToFolderDialogOpen: false,
  createFolderDialogOpen: false
};

jest.mock("../../../stores/AssetGridStore", () => ({
  useAssetGridStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState)
}));

const createAsset = (id: string, content_type = "image/png"): Asset =>
  ({
    id,
    user_id: "u",
    workflow_id: null,
    parent_id: "p",
    name: id,
    content_type,
    metadata: null,
    created_at: "0",
    get_url: "url",
    thumb_url: null,
    duration: null
  } as unknown as Asset);

const comboKey = (combo: string[]) => [...combo].sort().join("+");
const find = (combo: string[]) =>
  registrations.find((r) => comboKey(r.combo) === comboKey(combo));

const resetStore = () => {
  storeState.selectedAssetIds = [];
  storeState.openAsset = null;
  storeState.deleteDialogOpen = false;
  storeState.renameDialogOpen = false;
  storeState.moveToFolderDialogOpen = false;
  storeState.createFolderDialogOpen = false;
  jest.clearAllMocks();
};

beforeEach(() => {
  registrations = [];
  resetStore();
});

const assets = [createAsset("1"), createAsset("2"), createAsset("3")];

describe("useAssetGridShortcuts", () => {
  it("registers select-all, delete and deselect combos", () => {
    renderHook(() => useAssetGridShortcuts(assets, true));
    expect(find(["meta", "a"])).toBeDefined();
    expect(find(["control", "a"])).toBeDefined();
    expect(find(["delete"])).toBeDefined();
    expect(find(["backspace"])).toBeDefined();
    expect(find(["escape"])).toBeDefined();
  });

  it("does not bind Enter", () => {
    renderHook(() => useAssetGridShortcuts(assets, true));
    expect(find(["enter"])).toBeUndefined();
  });

  it("disables every combo when not enabled", () => {
    storeState.selectedAssetIds = ["1"];
    renderHook(() => useAssetGridShortcuts(assets, false));
    for (const reg of registrations) {
      expect(reg.active).toBe(false);
    }
  });

  it("disables every combo while an overlay is open", () => {
    storeState.selectedAssetIds = ["1"];
    storeState.deleteDialogOpen = true;
    renderHook(() => useAssetGridShortcuts(assets, true));
    for (const reg of registrations) {
      expect(reg.active).toBe(false);
    }
  });

  it("select-all resolves ids against the passed assets", () => {
    renderHook(() => useAssetGridShortcuts(assets, true));
    find(["meta", "a"])!.callback();
    expect(storeState.setSelectedAssets).toHaveBeenCalledWith(assets);
    expect(storeState.setSelectedAssetIds).toHaveBeenCalledWith(["1", "2", "3"]);
  });

  it("select-all stays active even with an empty selection", () => {
    renderHook(() => useAssetGridShortcuts(assets, true));
    expect(find(["meta", "a"])!.active).toBe(true);
  });

  it("delete opens the confirm dialog only with a selection", () => {
    const { rerender } = renderHook(
      ({ ids }) => {
        storeState.selectedAssetIds = ids;
        return useAssetGridShortcuts(assets, true);
      },
      { initialProps: { ids: [] as string[] } }
    );
    // No selection: combo inactive.
    expect(find(["delete"])!.active).toBe(false);

    registrations = [];
    rerender({ ids: ["1", "2"] });
    expect(find(["delete"])!.active).toBe(true);
    find(["delete"])!.callback();
    expect(storeState.setDeleteDialogOpen).toHaveBeenCalledWith(true);
  });

  it("escape clears the selection", () => {
    storeState.selectedAssetIds = ["1"];
    renderHook(() => useAssetGridShortcuts(assets, true));
    expect(find(["escape"])!.active).toBe(true);
    find(["escape"])!.callback();
    expect(storeState.setSelectedAssetIds).toHaveBeenCalledWith([]);
    expect(storeState.setSelectedAssets).toHaveBeenCalledWith([]);
  });

  it("escape is inactive with no selection", () => {
    renderHook(() => useAssetGridShortcuts(assets, true));
    expect(find(["escape"])!.active).toBe(false);
  });
});
