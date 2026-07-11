import { ThreadInfo } from "../types/thread.types";

export const sortThreadsByDate = (
  threads: Record<string, ThreadInfo>
): Array<[string, ThreadInfo]> => {
  return Object.entries(threads).sort((a, b) => {
    const aDateStr = a[1].updatedAt || "";
    const bDateStr = b[1].updatedAt || "";
    return bDateStr.localeCompare(aDateStr);
  });
};