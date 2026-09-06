/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useState } from "react";
import type { recipes as recipeSchemas } from "@nodetool-ai/protocol/api-schemas";
import { trpc } from "../../trpc/client";
import { useRecipeActions } from "../../hooks/useRecipeActions";
import { BASE_URL } from "../../stores/BASE_URL";
import {
  BORDER_RADIUS,
  EmptyState,
  LoadingSpinner,
  MOTION,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useSectionWrap, SectionHeader } from "./dashboardChrome";

type Recipe = recipeSchemas.ExampleRecipeSummary;
type RecipeStep = recipeSchemas.ExampleRecipeStep;
type RecipeApp = recipeSchemas.ExampleRecipeApp;

const thumbSrc = (url: string | null): string | null => {
  if (!url) return null;
  return url.startsWith("http") ? url : `${BASE_URL}${url}`;
};

const styles = (theme: Theme) =>
  css({
    // The page hands the rest of the viewport to the template browser below,
    // so the recipe band keeps its own height and scrolls when a chain is
    // expanded rather than squeezing the list under it.
    flexShrink: 0,
    maxHeight: "60%",
    overflowY: "auto",
    paddingTop: getSpacingPx(SPACING.xxl),
    ".rcp-lede": {
      margin: `0 0 ${getSpacingPx(SPACING.sm)}`,
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary
    },
    ".rcp-list": {
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.sm)
    },
    ".rcp": {
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.lg,
      background: theme.vars.palette.c_node_bg,
      overflow: "hidden"
    },
    ".rcp-head": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      padding: getSpacingPx(SPACING.md)
    },
    ".rcp-toggle": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      flex: 1,
      minWidth: 0,
      textAlign: "left",
      padding: getSpacingPx(SPACING.xs),
      margin: `-${getSpacingPx(SPACING.xs)}`,
      background: "transparent",
      border: "none",
      borderRadius: BORDER_RADIUS.sm,
      cursor: "pointer",
      transition: `background ${MOTION.fast}`,
      "&:hover": { background: theme.vars.palette.action.hover }
    },
    ".rcp-thumb": {
      flexShrink: 0,
      width: 96,
      height: 54,
      objectFit: "cover",
      borderRadius: BORDER_RADIUS.sm,
      background: theme.vars.palette.c_node_bg_group
    },
    ".rcp-text": { flex: 1, minWidth: 0 },
    ".rcp-name": {
      display: "block",
      fontSize: "var(--fontSizeNormal)",
      color: theme.vars.palette.text.primary
    },
    ".rcp-outcome": {
      display: "block",
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".rcp-meta": {
      flexShrink: 0,
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      [theme.breakpoints.down("sm")]: { display: "none" }
    },
    ".rcp-add": {
      flexShrink: 0,
      padding: `${getSpacingPx(SPACING.xs)} ${getSpacingPx(SPACING.md)}`,
      borderRadius: BORDER_RADIUS.pill,
      border: `1px solid rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`,
      background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
      color: theme.vars.palette.primary.main,
      fontSize: "var(--fontSizeSmaller)",
      cursor: "pointer",
      transition: `background ${MOTION.fast}`,
      "&:hover": {
        background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.22)`
      },
      "&:disabled": { cursor: "wait", opacity: 0.6 }
    },
    // The header button sits in a row; the one under the open chain sits in a
    // column, where a stretched button would read as a banner.
    ".rcp-add.inline": { alignSelf: "flex-start" },
    ".rcp-app": {
      display: "flex",
      alignItems: "flex-start",
      gap: getSpacingPx(SPACING.md),
      padding: getSpacingPx(SPACING.sm),
      border: `1px solid rgba(${theme.vars.palette.primary.mainChannel} / 0.35)`,
      borderRadius: BORDER_RADIUS.sm,
      background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.06)`
    },
    ".rcp-app-name": {
      display: "block",
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.primary
    },
    ".rcp-app-role": {
      display: "block",
      fontSize: "var(--fontSizeSmaller)",
      lineHeight: 1.6,
      color: theme.vars.palette.text.secondary
    },
    ".rcp-steps-lede": {
      margin: 0,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled
    },
    ".rcp-body": {
      borderTop: `1px solid ${theme.vars.palette.divider}`,
      padding: getSpacingPx(SPACING.md),
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.sm)
    },
    ".rcp-summary": {
      margin: 0,
      maxWidth: "72ch",
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1.6,
      color: theme.vars.palette.text.secondary
    },
    ".rcp-step": {
      display: "flex",
      alignItems: "flex-start",
      gap: getSpacingPx(SPACING.md),
      width: "100%",
      textAlign: "left",
      padding: getSpacingPx(SPACING.sm),
      background: "transparent",
      border: "none",
      borderRadius: BORDER_RADIUS.sm,
      cursor: "pointer",
      transition: `background ${MOTION.fast}`,
      "&:hover": { background: theme.vars.palette.action.hover },
      "&.loading": { cursor: "wait", pointerEvents: "none" }
    },
    ".rcp-index": {
      flexShrink: 0,
      width: 24,
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.primary.main
    },
    ".rcp-step-title": {
      display: "block",
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.primary
    },
    ".rcp-step-text": {
      display: "block",
      fontSize: "var(--fontSizeSmaller)",
      lineHeight: 1.6,
      color: theme.vars.palette.text.secondary
    },
    ".rcp-models": {
      display: "flex",
      flexWrap: "wrap",
      gap: getSpacingPx(SPACING.xs),
      paddingTop: getSpacingPx(SPACING.xs)
    },
    ".rcp-model": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled,
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.sm,
      padding: `0 ${getSpacingPx(SPACING.xs)}`
    },
    ".rcp-caveat": {
      margin: 0,
      fontSize: "var(--fontSizeSmaller)",
      lineHeight: 1.6,
      color: theme.vars.palette.text.disabled
    },
    ".rcp-loading, .rcp-empty": {
      display: "flex",
      justifyContent: "center",
      padding: `${getSpacingPx(SPACING.xxl)} 0`
    }
  });

interface RecipeStepRowProps {
  index: number;
  step: RecipeStep;
  slug: string;
  copyingStep: string | null;
  onOpen: (slug: string, step: RecipeStep) => void;
}

const RecipeStepRow = memo(function RecipeStepRow({
  index,
  step,
  slug,
  copyingStep,
  onOpen
}: RecipeStepRowProps) {
  const loading = copyingStep === `${slug}:${step.example}`;
  return (
    <button
      type="button"
      className={loading ? "rcp-step loading" : "rcp-step"}
      onClick={() => onOpen(slug, step)}
      title={`Open ${step.example}`}
    >
      <span className="rcp-index">
        {loading ? (
          <LoadingSpinner size="small" />
        ) : (
          String(index + 1).padStart(2, "0")
        )}
      </span>
      <span className="rcp-text">
        <span className="rcp-step-title">
          {step.role} — {step.example}
        </span>
        <span className="rcp-step-text">{step.handoff}</span>
        <span className="rcp-models">
          {step.models.length > 0 ? (
            step.models.map((model) => (
              <span
                key={`${model.provider}:${model.model}`}
                className="rcp-model"
              >
                {model.model}
              </span>
            ))
          ) : (
            <span className="rcp-model">Runs locally — no key needed</span>
          )}
        </span>
      </span>
    </button>
  );
});

interface RecipeAppRowProps {
  app: RecipeApp;
  installingApp: string | null;
  onInstall: (appSlug: string) => void;
}

const RecipeAppRow = memo(function RecipeAppRow({
  app,
  installingApp,
  onInstall
}: RecipeAppRowProps) {
  const installing = installingApp === app.slug;
  return (
    <div className="rcp-app">
      <span className="rcp-text">
        <span className="rcp-app-name">
          {app.name} — {app.operationCount} steps on one page
        </span>
        <span className="rcp-app-role">{app.role}</span>
        <span className="rcp-models">
          {app.workflows.map((workflow) => (
            <span key={workflow} className="rcp-model">
              {workflow}
            </span>
          ))}
        </span>
      </span>
      <button
        type="button"
        className="rcp-add"
        disabled={installing}
        onClick={() => onInstall(app.slug)}
      >
        {installing ? "Installing…" : "Install app"}
      </button>
    </div>
  );
});

interface RecipeCardProps {
  recipe: Recipe;
  expanded: boolean;
  onToggle: (slug: string) => void;
}

const RecipeCard = memo(function RecipeCard({
  recipe,
  expanded,
  onToggle
}: RecipeCardProps) {
  const { copyingStep, addingSlug, installingApp, openStep, installApp, addRecipe } =
    useRecipeActions();
  const thumb = thumbSrc(recipe.thumbnailUrl);
  const adding = addingSlug === recipe.slug;
  // The first app is the one built for this chain; the primary action installs
  // it, and the rest of the chain is one expand away.
  const primaryApp = recipe.apps[0];
  const installingPrimary = installingApp === primaryApp?.slug;

  return (
    <div className="rcp">
      <div className="rcp-head">
        <button
          type="button"
          className="rcp-toggle"
          aria-expanded={expanded}
          onClick={() => onToggle(recipe.slug)}
        >
          {thumb && (
            <img className="rcp-thumb" src={thumb} alt="" loading="lazy" />
          )}
          <span className="rcp-text">
            <span className="rcp-name">{recipe.name}</span>
            <span className="rcp-outcome">{recipe.outcome}</span>
          </span>
          <span className="rcp-meta">
            {recipe.apps.length} {recipe.apps.length === 1 ? "app" : "apps"} ·{" "}
            {recipe.steps.length} workflows · {recipe.nodeCount} nodes
          </span>
        </button>
        {primaryApp && (
          <button
            type="button"
            className="rcp-add"
            disabled={installingPrimary}
            onClick={() => void installApp(primaryApp.slug)}
          >
            {installingPrimary ? "Installing…" : `Install ${primaryApp.name}`}
          </button>
        )}
      </div>

      {expanded && (
        <div className="rcp-body">
          {recipe.summary.map((paragraph) => (
            <p key={paragraph} className="rcp-summary">
              {paragraph}
            </p>
          ))}
          {recipe.apps.map((app) => (
            <RecipeAppRow
              key={app.slug}
              app={app}
              installingApp={installingApp}
              onInstall={installApp}
            />
          ))}
          <p className="rcp-steps-lede">
            The workflows behind those apps. Open one to change how a step
            works, or add the whole chain as graphs.
          </p>
          {recipe.steps.map((step, index) => (
            <RecipeStepRow
              key={step.example}
              index={index}
              step={step}
              slug={recipe.slug}
              copyingStep={copyingStep}
              onOpen={openStep}
            />
          ))}
          <button
            type="button"
            className="rcp-add inline"
            disabled={adding}
            onClick={() => void addRecipe(recipe)}
          >
            {adding
              ? "Adding…"
              : `Add all ${recipe.steps.length} as workflows`}
          </button>
          {recipe.caveats.map((caveat) => (
            <p key={caveat} className="rcp-caveat">
              {caveat}
            </p>
          ))}
        </div>
      )}
    </div>
  );
});

/**
 * The shipped recipes: one outcome, the app that reaches it, and the ordered
 * example workflows that app is made of. The card's primary action installs
 * the app; expanding it lists the other apps that cover part of the chain and
 * the workflows behind them, each openable as a graph.
 */
const DashboardRecipes: React.FC = () => {
  const theme = useTheme();
  const sectionWrap = useSectionWrap();
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = trpc.workflows.recipes.useQuery(
    undefined,
    { staleTime: 5 * 60_000 }
  );

  const recipes = data ?? [];
  if (!isLoading && !isError && recipes.length === 0) {
    return null;
  }

  return (
    <section css={styles(theme)}>
      <div css={sectionWrap}>
        <SectionHeader title="Recipes" count={`${recipes.length}`} />
        <p className="rcp-lede">
          Each one installs as an app that runs the whole chain, with the
          example workflows behind it in your library to edit.
        </p>
        {isLoading ? (
          <div className="rcp-loading">
            <LoadingSpinner size="medium" text="Loading recipes" />
          </div>
        ) : isError ? (
          <div className="rcp-empty">
            <EmptyState
              variant="error"
              title="Couldn't load recipes"
              description="Try again in a moment."
              actionText="Retry"
              onAction={() => refetch()}
            />
          </div>
        ) : (
          <div className="rcp-list">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.slug}
                recipe={recipe}
                expanded={expanded === recipe.slug}
                onToggle={(slug) =>
                  setExpanded((current) => (current === slug ? null : slug))
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardRecipes);
