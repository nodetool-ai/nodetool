import { devError } from "./DevLog";

export const isUrlAccessible = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch (error) {
    devError("isUrlAccessible: Error checking URL:", error);
    return false;
  }
};
