import { presetText, presetTextKey } from "../presetText";

describe("presetText", () => {
  const preset = {
    id: "camera.dolly-in",
    name: "Dolly in",
    description: "Move toward the subject"
  };

  it("builds the catalog key from the preset id", () => {
    expect(presetTextKey("camera.dolly-in")).toBe(
      "preset_catalog.camera.dolly-in"
    );
  });

  it("looks up name and description with the English defaults", () => {
    const t = jest.fn(
      (_key: string, o: { defaultValue: string }) => o.defaultValue
    );
    expect(presetText(t, preset)).toEqual({
      name: "Dolly in",
      description: "Move toward the subject"
    });
    expect(t).toHaveBeenCalledWith("preset_catalog.camera.dolly-in.name", {
      defaultValue: "Dolly in"
    });
    expect(t).toHaveBeenCalledWith(
      "preset_catalog.camera.dolly-in.description",
      { defaultValue: "Move toward the subject" }
    );
  });

  it("returns translations when the locale has them", () => {
    const t = (key: string) => `fr:${key}`;
    expect(presetText(t, preset).name).toBe(
      "fr:preset_catalog.camera.dolly-in.name"
    );
  });
});
