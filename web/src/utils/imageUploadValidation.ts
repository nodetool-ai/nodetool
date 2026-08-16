import { isFunction } from "./typePredicates";
export type UploadSource = "clipboard" | "drop" | "file";

type SniffedImageMime =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/svg+xml";

interface PreparedUploadFile {
  file: File;
  declaredMime: string;
  sniffedMime: SniffedImageMime | null;
  finalMime: string;
  size: number;
}

export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

const IMAGE_EXTENSION_MAP = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg"
} satisfies Record<SniffedImageMime, string>;

const HEADER_BYTES = 512;

const splitFileName = (fileName: string) => {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0) {
    return { base: fileName, extension: "" };
  }
  return {
    base: fileName.slice(0, lastDot),
    extension: fileName.slice(lastDot + 1).toLowerCase()
  };
};

const ensureExtension = (fileName: string, extension: string): string => {
  const { base, extension: existingExtension } = splitFileName(fileName);
  if (existingExtension === extension) {
    return fileName;
  }
  return `${base}.${extension}`;
};

const isPng = (bytes: Uint8Array): boolean =>
  bytes.length >= 8 &&
  bytes[0] === 0x89 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x4e &&
  bytes[3] === 0x47 &&
  bytes[4] === 0x0d &&
  bytes[5] === 0x0a &&
  bytes[6] === 0x1a &&
  bytes[7] === 0x0a;

const isJpeg = (bytes: Uint8Array): boolean =>
  bytes.length >= 3 &&
  bytes[0] === 0xff &&
  bytes[1] === 0xd8 &&
  bytes[2] === 0xff;

const isGif = (bytes: Uint8Array): boolean =>
  bytes.length >= 6 &&
  bytes[0] === 0x47 &&
  bytes[1] === 0x49 &&
  bytes[2] === 0x46 &&
  bytes[3] === 0x38 &&
  (bytes[4] === 0x39 || bytes[4] === 0x37) &&
  bytes[5] === 0x61;

const isWebp = (bytes: Uint8Array): boolean =>
  bytes.length >= 12 &&
  bytes[0] === 0x52 &&
  bytes[1] === 0x49 &&
  bytes[2] === 0x46 &&
  bytes[3] === 0x46 &&
  bytes[8] === 0x57 &&
  bytes[9] === 0x45 &&
  bytes[10] === 0x42 &&
  bytes[11] === 0x50;

const isSvg = (bytes: Uint8Array): boolean => {
  let start = 0;
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    start = 3;
  }
  const text = new TextDecoder("utf-8").decode(bytes.subarray(start)).trimStart();
  if (text.startsWith("<svg")) {
    return true;
  }
  return text.startsWith("<?xml") && /<svg[\s>]/i.test(text);
};

export const sniffImageMimeType = (bytes: Uint8Array): SniffedImageMime | null => {
  if (isPng(bytes)) {
    return "image/png";
  }
  if (isJpeg(bytes)) {
    return "image/jpeg";
  }
  if (isGif(bytes)) {
    return "image/gif";
  }
  if (isWebp(bytes)) {
    return "image/webp";
  }
  if (isSvg(bytes)) {
    return "image/svg+xml";
  }
  return null;
};

const createRenamedFile = (
  file: File,
  mimeType: string,
  extension?: string
): File => {
  const nextName =
    extension && extension.length > 0 ? ensureExtension(file.name, extension) : file.name;
  return new File([file], nextName, {
    type: mimeType,
    lastModified: file.lastModified
  });
};

export const prepareUploadFile = async (
  file: File,
  source: UploadSource
): Promise<PreparedUploadFile> => {
  const declaredMime = file.type || "";
  const isImageSource = source === "clipboard" || source === "drop";
  const shouldValidateImage = isImageSource;

  if (shouldValidateImage && file.size <= 0) {
    if (source === "clipboard") {
      throw new UploadValidationError("Clipboard content is not a valid image");
    }
    throw new UploadValidationError("Dropped content is not a valid image");
  }

  if (!shouldValidateImage) {
    return {
      file,
      declaredMime,
      sniffedMime: null,
      finalMime: declaredMime || "application/octet-stream",
      size: file.size
    };
  }

  const headerBytes = await (async (): Promise<Uint8Array> => {
    const sliced = file.slice(0, HEADER_BYTES);
    if (isFunction(sliced.arrayBuffer)) {
      const headerBuffer = await sliced.arrayBuffer();
      return new Uint8Array(headerBuffer);
    }

    const headerBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
          return;
        }
        reject(new Error("Unable to read file header"));
      };
      reader.onerror = () => reject(new Error("Unable to read file header"));
      reader.readAsArrayBuffer(sliced);
    });
    return new Uint8Array(headerBuffer);
  })();
  const sniffedMime = sniffImageMimeType(headerBytes);

  if (sniffedMime) {
    const extension = IMAGE_EXTENSION_MAP[sniffedMime];
    const normalizedFile = createRenamedFile(file, sniffedMime, extension);
    return {
      file: normalizedFile,
      declaredMime,
      sniffedMime,
      finalMime: sniffedMime,
      size: file.size
    };
  }

  const declaredSvg =
    declaredMime === "image/svg+xml" ||
    file.name.toLowerCase().endsWith(".svg");
  if (declaredSvg) {
    const normalizedFile = createRenamedFile(file, "image/svg+xml", "svg");
    return {
      file: normalizedFile,
      declaredMime,
      sniffedMime: null,
      finalMime: "image/svg+xml",
      size: file.size
    };
  }

  if (source === "clipboard") {
    throw new UploadValidationError("Clipboard content is not a valid image");
  }

  const downgradedFile = createRenamedFile(file, "application/octet-stream");
  return {
    file: downgradedFile,
    declaredMime,
    sniffedMime: null,
    finalMime: "application/octet-stream",
    size: file.size
  };
};
