import log from "loglevel";
import { validateFetchUrl } from "./urlValidation";

export const isUrlAccessible = async (url: string): Promise<boolean> => {
  // Validate URL before fetching to prevent SSRF attacks
  if (!validateFetchUrl(url)) {
    log.warn("isUrlAccessible: URL validation failed:", url);
    return false;
  }

  try {
    const response = await fetch(url, { method: "HEAD" });
    // Explicitly check ok property to ensure we always return a boolean
    return response.ok === true;
  } catch (error) {
    log.error("isUrlAccessible: Error checking URL:", error);
    return false;
  }
};
