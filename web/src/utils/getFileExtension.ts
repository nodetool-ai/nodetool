export const getFileExtension = (filename: string): string => {
  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex === -1 || lastDotIndex === 0) return ""; // No extension or hidden file
  return filename.substring(lastDotIndex + 1);
};
