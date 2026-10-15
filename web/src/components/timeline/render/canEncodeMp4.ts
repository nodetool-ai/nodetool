/**
 * Whether this browser's encoder can write the MP4 (H.264) export at the
 * timeline's size and the bitrate the renderer asks for. A browser without an
 * H.264 encoder fails the export only after it starts, with the encoder's
 * own configuration string as the message.
 *
 * An unanswered probe counts as supported, so a probe failure never takes
 * MP4 away from a browser that can write it.
 */
export async function canEncodeMp4(width: number, height: number): Promise<boolean> {
  try {
    const { canEncodeVideo, QUALITY_HIGH } = await import("mediabunny");
    return await canEncodeVideo("avc", { width, height, bitrate: QUALITY_HIGH });
  } catch {
    return true;
  }
}
