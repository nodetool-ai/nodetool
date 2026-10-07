import {
  registerTimelineSaver,
  saveTimelineThroughEditor,
  type TimelineSaveResult
} from "../timelineSaveRegistry";

const ok: TimelineSaveResult = { ok: true, updatedAt: null, sent: null };

describe("timelineSaveRegistry", () => {
  it("returns null when no editor holds the sequence", () => {
    expect(saveTimelineThroughEditor("none")).toBeNull();
  });

  it("routes the save to the saver that handles the sequence", async () => {
    const saveA = jest.fn().mockResolvedValue(ok);
    const saveB = jest
      .fn()
      .mockResolvedValue({ ok: false, error: "boom" } as TimelineSaveResult);
    const offA = registerTimelineSaver({ handles: (id) => id === "a", save: saveA });
    const offB = registerTimelineSaver({ handles: (id) => id === "b", save: saveB });

    await expect(saveTimelineThroughEditor("b")).resolves.toEqual({
      ok: false,
      error: "boom"
    });
    expect(saveA).not.toHaveBeenCalled();
    expect(saveB).toHaveBeenCalledTimes(1);
    expect(saveTimelineThroughEditor("c")).toBeNull();

    offA();
    offB();
  });

  it("stops routing to a saver once it unregisters", () => {
    const save = jest.fn().mockResolvedValue(ok);
    const off = registerTimelineSaver({ handles: () => true, save });
    expect(saveTimelineThroughEditor("x")).not.toBeNull();
    off();
    expect(saveTimelineThroughEditor("x")).toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
