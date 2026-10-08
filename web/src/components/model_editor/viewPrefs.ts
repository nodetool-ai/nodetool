// Viewport display toggles, remembered across sessions.
const VIEW_PREFS_KEY = "model3d.viewPrefs";

export interface ViewPrefs {
  grid: boolean;
  wireframe: boolean;
  lightIcons: boolean;
  snap: boolean;
}

export const DEFAULT_VIEW_PREFS: ViewPrefs = {
  grid: true,
  wireframe: false,
  lightIcons: true,
  snap: false
};

export const readViewPrefs = (): ViewPrefs => {
  try {
    const raw = localStorage.getItem(VIEW_PREFS_KEY);
    if (!raw) {
      return DEFAULT_VIEW_PREFS;
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return { ...DEFAULT_VIEW_PREFS, ...(parsed as Partial<ViewPrefs>) };
    }
  } catch {
    // Fall through to defaults on unreadable storage.
  }
  return DEFAULT_VIEW_PREFS;
};

export const writeViewPrefs = (prefs: ViewPrefs): void => {
  try {
    localStorage.setItem(VIEW_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Persistence is best-effort; ignore storage failures.
  }
};
