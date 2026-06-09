import {
  prepareUploadFile,
  sniffImageMimeType,
  UploadValidationError
} from "../imageUploadValidation";

// GIF89a
const GIF89A_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

// GIF87a
const GIF87A_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);

// RIFF....WEBP (bytes 4-7 are file size, arbitrary here)
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50
]);

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

const RANDOM_BYTES = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02]);

describe("imageUploadValidation (formats)", () => {
  describe("sniffImageMimeType — GIF", () => {
    it("detects GIF89a magic bytes", () => {
      expect(sniffImageMimeType(GIF89A_BYTES)).toBe("image/gif");
    });

    it("detects GIF87a magic bytes", () => {
      expect(sniffImageMimeType(GIF87A_BYTES)).toBe("image/gif");
    });
  });

  describe("sniffImageMimeType — WebP", () => {
    it("detects WebP magic bytes", () => {
      expect(sniffImageMimeType(WEBP_BYTES)).toBe("image/webp");
    });

    it("detects WebP with non-zero file-size bytes", () => {
      const bytes = new Uint8Array(WEBP_BYTES);
      bytes[4] = 0xff;
      bytes[5] = 0x10;
      bytes[6] = 0x20;
      bytes[7] = 0x30;
      expect(sniffImageMimeType(bytes)).toBe("image/webp");
    });
  });

  describe("sniffImageMimeType — unknown / null", () => {
    it("returns null for random bytes", () => {
      expect(sniffImageMimeType(RANDOM_BYTES)).toBeNull();
    });

    it("returns null for an empty buffer", () => {
      expect(sniffImageMimeType(new Uint8Array([]))).toBeNull();
    });

    it("returns null for a single byte", () => {
      expect(sniffImageMimeType(new Uint8Array([0x89]))).toBeNull();
    });
  });

  describe("sniffImageMimeType — too-short buffers", () => {
    it("returns null when buffer is shorter than PNG header (7 bytes)", () => {
      const truncated = PNG_BYTES.slice(0, 7);
      expect(sniffImageMimeType(truncated)).toBeNull();
    });

    it("returns null when buffer is shorter than JPEG header (2 bytes)", () => {
      const truncated = new Uint8Array([0xff, 0xd8]);
      expect(sniffImageMimeType(truncated)).toBeNull();
    });

    it("returns null when buffer is shorter than GIF header (5 bytes)", () => {
      const truncated = GIF89A_BYTES.slice(0, 5);
      expect(sniffImageMimeType(truncated)).toBeNull();
    });

    it("returns null when buffer is shorter than WebP header (11 bytes)", () => {
      const truncated = WEBP_BYTES.slice(0, 11);
      expect(sniffImageMimeType(truncated)).toBeNull();
    });
  });

  describe("prepareUploadFile — drop source", () => {
    it("throws UploadValidationError for empty dropped file", async () => {
      const file = new File([], "dropped.png", { type: "image/png" });

      await expect(prepareUploadFile(file, "drop")).rejects.toThrow(
        UploadValidationError
      );
      await expect(prepareUploadFile(file, "drop")).rejects.toThrow(
        "Dropped content is not a valid image"
      );
    });

    it("accepts a valid dropped GIF", async () => {
      const file = new File([GIF89A_BYTES], "animation.gif", {
        type: "image/gif"
      });

      const prepared = await prepareUploadFile(file, "drop");

      expect(prepared.finalMime).toBe("image/gif");
      expect(prepared.sniffedMime).toBe("image/gif");
      expect(prepared.file.name.endsWith(".gif")).toBe(true);
    });

    it("accepts a valid dropped WebP", async () => {
      const file = new File([WEBP_BYTES], "photo.webp", {
        type: "image/webp"
      });

      const prepared = await prepareUploadFile(file, "drop");

      expect(prepared.finalMime).toBe("image/webp");
      expect(prepared.sniffedMime).toBe("image/webp");
      expect(prepared.file.name.endsWith(".webp")).toBe(true);
    });

    it("corrects file extension when sniffed type differs from declared", async () => {
      const file = new File([PNG_BYTES], "photo.jpeg", {
        type: "image/jpeg"
      });

      const prepared = await prepareUploadFile(file, "drop");

      expect(prepared.finalMime).toBe("image/png");
      expect(prepared.file.name).toBe("photo.png");
      expect(prepared.declaredMime).toBe("image/jpeg");
    });

    it("downgrades to application/octet-stream for unrecognized bytes", async () => {
      const file = new File([RANDOM_BYTES], "mystery.bin", {
        type: "application/octet-stream"
      });

      const prepared = await prepareUploadFile(file, "drop");

      expect(prepared.finalMime).toBe("application/octet-stream");
      expect(prepared.sniffedMime).toBeNull();
    });
  });

  describe("prepareUploadFile — file source", () => {
    it("passes through without sniffing, using declared MIME", async () => {
      const file = new File([RANDOM_BYTES], "document.pdf", {
        type: "application/pdf"
      });

      const prepared = await prepareUploadFile(file, "file");

      expect(prepared.finalMime).toBe("application/pdf");
      expect(prepared.sniffedMime).toBeNull();
      expect(prepared.declaredMime).toBe("application/pdf");
      expect(prepared.file).toBe(file);
    });

    it("returns application/octet-stream when file has no declared MIME", async () => {
      const file = new File([RANDOM_BYTES], "noext", { type: "" });

      const prepared = await prepareUploadFile(file, "file");

      expect(prepared.finalMime).toBe("application/octet-stream");
      expect(prepared.sniffedMime).toBeNull();
      expect(prepared.declaredMime).toBe("");
    });

    it("does not throw for empty file", async () => {
      const file = new File([], "empty.txt", { type: "text/plain" });

      const prepared = await prepareUploadFile(file, "file");

      expect(prepared.finalMime).toBe("text/plain");
      expect(prepared.size).toBe(0);
    });

    it("preserves the original file reference (no re-wrapping)", async () => {
      const file = new File([PNG_BYTES], "image.png", {
        type: "image/png"
      });

      const prepared = await prepareUploadFile(file, "file");

      expect(prepared.file).toBe(file);
    });
  });
});
