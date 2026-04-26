import { getInputKind, clampNumber } from "../utils";

describe("miniapps/utils", () => {
  describe("getInputKind", () => {
    it.each([
      ["nodetool.input.StringInput", "string"],
      ["nodetool.input.TextInput", "string"],
      ["nodetool.input.MessageInput", "string"],
      ["nodetool.input.BooleanInput", "boolean"],
      ["nodetool.input.IntegerInput", "integer"],
      ["nodetool.input.FloatInput", "float"],
      ["nodetool.input.ColorInput", "color"],
      ["nodetool.input.ImageInput", "image"],
      ["nodetool.input.VideoInput", "video"],
      ["nodetool.input.AudioInput", "audio"],
      ["nodetool.input.RealtimeAudioInput", "audio"],
      ["nodetool.input.DocumentInput", "document"],
      ["nodetool.input.DataFrameInput", "dataframe"],
      ["nodetool.input.DataframeInput", "dataframe"],
      ["nodetool.input.FilePathInput", "file_path"],
      ["nodetool.input.FolderPathInput", "folder_path"],
      ["nodetool.input.Folder", "folder"],
      ["nodetool.input.SelectInput", "select"],
      ["nodetool.input.LanguageModelInput", "language_model"],
      ["nodetool.input.ImageModelInput", "image_model"],
      ["nodetool.input.VideoModelInput", "video_model"],
      ["nodetool.input.TTSModelInput", "tts_model"],
      ["nodetool.input.ASRModelInput", "asr_model"],
      ["nodetool.input.EmbeddingModelInput", "embedding_model"],
      ["nodetool.input.ImageListInput", "image_list"],
      ["nodetool.input.VideoListInput", "video_list"],
      ["nodetool.input.AudioListInput", "audio_list"],
      ["nodetool.input.TextListInput", "text_list"],
      ["nodetool.input.StringListInput", "text_list"]
    ] as const)("maps %s to %s", (nodeType, expected) => {
      expect(getInputKind(nodeType)).toBe(expected);
    });

    it("returns null for unknown node types", () => {
      expect(getInputKind("nodetool.input.Unknown")).toBeNull();
      expect(getInputKind("")).toBeNull();
      expect(getInputKind("some.other.Type")).toBeNull();
    });
  });

  describe("clampNumber", () => {
    it("returns value when no bounds", () => {
      expect(clampNumber(50)).toBe(50);
      expect(clampNumber(-10)).toBe(-10);
    });

    it("clamps to min", () => {
      expect(clampNumber(-5, 0)).toBe(0);
      expect(clampNumber(5, 10)).toBe(10);
    });

    it("clamps to max", () => {
      expect(clampNumber(150, undefined, 100)).toBe(100);
      expect(clampNumber(50, undefined, 25)).toBe(25);
    });

    it("clamps to both min and max", () => {
      expect(clampNumber(-5, 0, 100)).toBe(0);
      expect(clampNumber(150, 0, 100)).toBe(100);
      expect(clampNumber(50, 0, 100)).toBe(50);
    });

    it("handles equal min and max", () => {
      expect(clampNumber(50, 10, 10)).toBe(10);
    });
  });
});
