import { ThreadInfo } from "./types";

export const sortThreadsByDate = (
  threads: Record<string, ThreadInfo>
): Array<[string, ThreadInfo]> => {
  return Object.entries(threads).sort((a, b) =>
    b[1].updatedAt.localeCompare(a[1].updatedAt)
  );
};