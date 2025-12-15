export function uuidv4(): string {
  /**
   * Generate a random UUID.
   */
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (char) {
    const randomValue = (Math.random() * 16) | 0; // nosec
    const hexValue = char === "x" ? randomValue : (randomValue & 3) | 8; // nosec
    return hexValue.toString(16);
  });
}
