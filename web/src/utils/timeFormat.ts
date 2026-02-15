/**
 * Format seconds into precise time display.
 * Returns formatted text and size key for appropriate font sizing.
 *
 * @param seconds - The number of seconds to format
 * @returns Object with formatted text and size key
 */
export const formatRunningTime = (
  seconds: number
): { text: string; sizeKey: "smaller" | "tiny" | "tinyer" } => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    // H:MM:SS format
    const text = `${hrs}:${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
    return { text, sizeKey: "tinyer" };
  }
  if (mins >= 10) {
    // MM:SS format
    const text = `${mins}:${secs.toString().padStart(2, "0")}`;
    return { text, sizeKey: "tiny" };
  }
  // M:SS format
  return {
    text: `${mins}:${secs.toString().padStart(2, "0")}`,
    sizeKey: "smaller"
  };
};
