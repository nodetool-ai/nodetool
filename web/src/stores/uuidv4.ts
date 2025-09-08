export function uuidv4(): string {
  /**
   * Generate a random UUID.
   */
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0; // nosec
    const v = c === "x" ? r : (r & 3) | 8; // nosec
    return v.toString(16);
  });
}
