export const titleizeString = (str: string): string => {
  return str
    .toLowerCase()
    .split(/[ _]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
