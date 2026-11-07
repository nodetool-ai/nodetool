// file-type's browser entry lacks the path helper liteparse imports. Files are
// read through the guest filesystem, so only granted paths are reachable.
import { fileTypeFromBuffer } from "file-type/core";
import { readFile } from "../host/fs-promises.mjs";

export * from "file-type/core";
export async function fileTypeFromFile(path) {
  return fileTypeFromBuffer(await readFile(path));
}
