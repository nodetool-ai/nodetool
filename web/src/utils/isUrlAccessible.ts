import log from "loglevel";

export const isUrlAccessible = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch (error) {
    log.error("isUrlAccessible: Error checking URL:", error);
    return false;
  }
};
