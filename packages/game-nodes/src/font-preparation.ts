/** Detect the font containers accepted by the game renderer and export builder. */
export function gameFontFormat(bytes: Uint8Array): "ttf" | "otf" | null {
  if (bytes.length < 12) { return null; }
  const trueType = bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0;
  const openType = bytes[0] === 79 && bytes[1] === 84 && bytes[2] === 84 && bytes[3] === 79;
  if (!trueType && !openType) { return null; }
  const tables = bytes[4] * 256 + bytes[5];
  if (tables < 1 || 12 + tables * 16 > bytes.length) { return null; }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < tables; index += 1) {
    const position = 12 + index * 16;
    const offset = view.getUint32(position + 8);
    const length = view.getUint32(position + 12);
    if (offset < 12 + tables * 16 || offset + length > bytes.length) { return null; }
  }
  return trueType ? "ttf" : "otf";
}
