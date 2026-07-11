// App "pages" that open as workspace tabs (type: "page") instead of their own
// route. The title is looked up here so the tab bar and the logo menu stay in
// sync.
export type PageTabKey =
  | "tutorials"
  | "examples"
  | "costs"
  | "models"
  | "packages"
  | "collections"
  | "workspaces"
  | "settings";

export const PAGE_TAB_TITLES: Record<PageTabKey, string> = {
  tutorials: "Tutorials",
  examples: "Examples",
  costs: "Costs",
  models: "Model Manager",
  packages: "Package Manager",
  collections: "Collections",
  workspaces: "Workspaces",
  settings: "Settings"
};

export const isPageTabKey = (value: string): value is PageTabKey =>
  Object.prototype.hasOwnProperty.call(PAGE_TAB_TITLES, value);
