export const base64ErrorImage =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/**
 * Converts a Uint8Array to a Base64 encoded string.
 *
 * @param {Uint8Array} uint8Array - The Uint8Array to be converted to Base64.
 * @returns {string} The Base64 encoded string representation of the input.
 * @throws {Error} If the conversion process fails.
 */
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

/**
 * Creates a data URI from a Uint8Array.
 *
 * This function takes a Uint8Array and a MIME type, and returns a data URI
 * that can be used to embed the binary data directly in web pages or CSS.
 *
 * @param {Uint8Array} uint8Array - The Uint8Array to be converted to a data URI.
 * @param {string} mimeType - The MIME type of the binary data (e.g., 'image/jpeg', 'application/pdf').
 * @returns {string} The data URI representing the input Uint8Array.
 * @throws {Error} If the conversion process fails.
 *
 * @example
 * const pdfData = new Uint8Array([...]); // PDF file data
 * const dataUri = uint8ArrayToDataUri(pdfData, 'application/pdf');
 * console.log(dataUri); // Outputs: data:application/pdf;base64,JVBERi0xLjQKJc...
 */
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
