/**
 * The named themes an application document may select.
 *
 * `ApplicationDocument.theme` is a `ThemeRef` — a name, not a stylesheet — so
 * this is the registry that name resolves against. A theme decides how the
 * app's page is presented: the surface it sits on, how wide its content runs,
 * and whether it reads as a page or as a card. Widget-level styling stays with
 * the widgets and the design tokens; a theme is deliberately not a way to
 * restyle every control.
 */
import { BORDER_RADIUS, SPACING } from "../ui_primitives";

interface AppTheme {
  id: string;
  label: string;
  /** Palette slot the page sits on. */
  surface: string;
  /** Content width cap, or null for full width. */
  maxWidth: number | null;
  /** Outer padding, from the spacing scale. */
  padding: number;
  /** True when the content block is drawn as a bordered, rounded card. */
  framed: boolean;
}

export const APP_THEMES: ReadonlyArray<AppTheme> = [
  {
    id: "default",
    label: "Default",
    surface: "background.default",
    maxWidth: null,
    padding: SPACING.xl,
    framed: false
  },
  {
    id: "centered",
    label: "Centered",
    surface: "background.default",
    maxWidth: 720,
    padding: SPACING.xl,
    framed: false
  },
  {
    id: "card",
    label: "Card",
    surface: "background.default",
    maxWidth: 880,
    padding: SPACING.xxl,
    framed: true
  }
];

export const DEFAULT_APP_THEME = APP_THEMES[0];

/** The theme a document's `theme.id` names, or the default when it names none. */
export const resolveAppTheme = (id: string | undefined | null): AppTheme =>
  APP_THEMES.find((theme) => theme.id === id) ?? DEFAULT_APP_THEME;

/** Card framing, applied only by themes that ask for it. */
export const appThemeFrame = (theme: AppTheme) =>
  theme.framed
    ? {
        backgroundColor: "background.paper",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: BORDER_RADIUS.lg,
        p: SPACING.xl
      }
    : {};
