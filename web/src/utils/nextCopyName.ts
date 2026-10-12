const MAX_NAME_LENGTH = 50;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Name a copy of `name` as "Base (n)", one past the highest number any of
 * `existingNames` already uses for that base.
 */
export const nextCopyName = (
  name: string,
  existingNames: readonly string[]
): string => {
  const baseName = name.replace(/ \(\d+\)$/, "");
  const pattern = new RegExp(`^${escapeRegExp(baseName)} \\((\\d+)\\)$`);
  const highest = existingNames.reduce((max, existing) => {
    const match = existing.match(pattern);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  return `${baseName} (${highest + 1})`.substring(0, MAX_NAME_LENGTH);
};
