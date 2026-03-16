export const base64ErrorImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/** Converts a Uint8Array to a Base64 encoded string. */
export function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  try {
    const numberArray = Array.from(uint8Array);
    const binaryString = numberArray.reduce(
      (str, byte) => str + String.fromCharCode(byte),
      ""
    );
    return btoa(binaryString);
  } catch (error) {
    console.error("Error converting Uint8Array to Base64:", error);
    return base64ErrorImage;
  }
}

/** Creates a data URI from a Uint8Array with the specified MIME type. */
export function uint8ArrayToDataUri(
  uint8Array: Uint8Array,
  mimeType: string
): string {
  try {
    const base64 = uint8ArrayToBase64(uint8Array);
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error("Error creating data URI:", error);
    throw new Error("Failed to create data URI");
  }
}
