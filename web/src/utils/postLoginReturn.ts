const RETURN_KEY = "nodetool.postLoginReturn";

// Only public share pages hand the user to sign-in and expect them back.
const isReturnPath = (path: string): boolean => /^\/view\/[^/]+$/.test(path);

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
