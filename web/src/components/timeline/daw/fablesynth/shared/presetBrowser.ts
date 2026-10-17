// Machine-independent preset browser model: the item shape every instrument
// supplies, filtering, and per-machine favorites. Each instrument adds its own
// adapter (load, snapshot, glyph, audition) on top; see
// components/presetBrowser/PresetBrowserShell.tsx.

export interface BrowserItem {
  value: string; // the machine's load key, e.g. 'f3' or 'u0'
  name: string;
  user: boolean;
  role: string | null;
  tags: string[];
}

export interface BrowserFilter {
  query: string;
  roles: ReadonlySet<string>;
  tags: ReadonlySet<string>;
  favoritesOnly: boolean;
  userOnly: boolean;
}

export const favoriteKey = (e: Pick<BrowserItem, 'name' | 'user'>) => (e.user ? 'u:' : 'f:') + e.name;

export function filterEntries<I extends BrowserItem>(entries: I[], f: BrowserFilter, favorites: ReadonlySet<string>): I[] {
  const q = f.query.trim().toLowerCase();
  return entries.filter((e) =>
    (!f.roles.size || (e.role !== null && f.roles.has(e.role))) &&
    [...f.tags].every((t) => e.tags.includes(t)) &&
    (!f.favoritesOnly || favorites.has(favoriteKey(e))) &&
    (!f.userOnly || e.user) &&
    (!q || e.name.toLowerCase().includes(q) || e.tags.some((t) => t.includes(q)) || (e.role ?? '').includes(q)));
}

export function loadFavorites(storageKey: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(storageKey) as string);
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveFavorites(storageKey: string, f: ReadonlySet<string>): void {
  try { localStorage.setItem(storageKey, JSON.stringify([...f])); } catch { /* storage unavailable */ }
}
