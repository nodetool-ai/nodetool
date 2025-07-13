import { ThreadInfo } from "../types/thread.types";

export const sortThreadsByDate = (
  threads: Record<string, ThreadInfo>
): Array<[string, ThreadInfo]> => {
  return Object.entries(threads).sort((a, b) => {
    // Handle both API Thread format (updated_at) and local ThreadInfo format (updatedAt)
    const aDate = (a[1] as any).updated_at || a[1].updatedAt;
    const bDate = (b[1] as any).updated_at || b[1].updatedAt;
    
    // Fallback to empty string if date is undefined
    const aDateStr = aDate || "";
    const bDateStr = bDate || "";
    
    return bDateStr.localeCompare(aDateStr);
  });
};