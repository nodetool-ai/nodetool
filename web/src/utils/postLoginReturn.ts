const RETURN_KEY = "nodetool.postLoginReturn";

// Only pages that hand a signed-out user to sign-in and expect them back:
// public share pages, and the MCP OAuth consent page, whose pending request
// lives only as long as its request_id.
const isReturnPath = (path: string): boolean =>
  /^\/view\/[^/]+$/.test(path) ||
  /^\/oauth\/consent\?request_id=[0-9a-f]+$/.test(path);

/** Remember where to send the user once sign-in completes. */
export const rememberPostLoginReturn = (path: string): void => {
  if (!isReturnPath(path)) {
    return;
  }
  try {
    sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    // Storage blocked: the user lands on the start page instead.
  }
};

/** The remembered path, cleared so it is used once, or null. */
export const consumePostLoginReturn = (): string | null => {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return path && isReturnPath(path) ? path : null;
  } catch {
    return null;
  }
};
