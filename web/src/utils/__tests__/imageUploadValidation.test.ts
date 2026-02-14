import {
  prepareUploadFile,
  sniffImageMimeType,
  UploadValidationError
} from "../imageUploadValidation";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe("imageUploadValidation", () => {
  describe("sniffImageMimeType", () => {
    it("sniffs PNG payload", () => {
      expect(sniffImageMimeType(PNG_BYTES)).toBe("image/png");
    });

    it("sniffs JPEG payload", () => {
      expect(sniffImageMimeType(JPEG_BYTES)).toBe("image/jpeg");
    });
  });

  describe("prepareUploadFile", () => {
    it("keeps valid clipboard PNG as image with sniffed MIME and extension", async () => {
      const file = new File([PNG_BYTES], "clipboard-image.jpeg", {
        type: "image/jpeg"
      });

      const prepared = await prepareUploadFile(file, "clipboard");

      expect(prepared.finalMime).toBe("image/png");
      expect(prepared.file.type).toBe("image/png");
      expect(prepared.file.name.endsWith(".png")).toBe(true);
    });

    it("rejects empty clipboard image payload", async () => {
      const file = new File([], "clipboard-image.png", {
        type: "image/png"
      });

      await expect(prepareUploadFile(file, "clipboard")).rejects.toThrow(
        new UploadValidationError("Clipboard content is not a valid image")
      );
    });

    it("blocks invalid clipboard bytes declared as image", async () => {
      const invalidImageBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      const file = new File([invalidImageBytes], "clipboard-image.jpg", {
        type: "image/jpeg"
      });

      await expect(prepareUploadFile(file, "clipboard")).rejects.toThrow(
        new UploadValidationError("Clipboard content is not a valid image")
      );
    });
  });
});
