export function truncateString(str: string, maxLength: number = 50): string {
  if (str.length > maxLength) {
    return str.slice(0, maxLength - 1) + "…";
  }
  return str;
}
