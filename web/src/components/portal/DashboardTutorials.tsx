/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { TutorialCard } from "../tutorials/TutorialCard";
import { TUTORIALS } from "../tutorials/tutorialsData";
import {
  BORDER_RADIUS,
  MOTION,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useSectionWrap, SectionHeader, SectionLink } from "./dashboardChrome";

const gridStyles = (theme: Theme) =>
  css({
    paddingTop: getSpacingPx(SPACING.md),
    ".tut-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: getSpacingPx(SPACING.md),
      [theme.breakpoints.down("md")]: {
        gridTemplateColumns: "repeat(2, 1fr)"
      },
      [theme.breakpoints.down("sm")]: {
        gridTemplateColumns: "1fr"
      }
    }
  });

const compactStyles = (theme: Theme) =>
  css({
    paddingTop: getSpacingPx(SPACING.md),
    ".tut-row": {
      display: "flex",
      flexWrap: "wrap",
      gap: getSpacingPx(SPACING.sm)
    },
    ".tut-chip": {
      display: "inline-flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.sm),
      height: 30,
      padding: `0 ${getSpacingPx(SPACING.lg)}`,
      borderRadius: BORDER_RADIUS.pill,
      border: `1px solid ${theme.vars.palette.divider}`,
      background: "transparent",
      color: theme.vars.palette.text.secondary,
      fontSize: "var(--fontSizeSmall)",
      cursor: "pointer",
      transition: `border-color ${MOTION.fast}, color ${MOTION.fast}`,
      "&:hover": {
        borderColor: theme.vars.palette.action.focus,
        color: theme.vars.palette.text.primary
      }
    },
    ".tut-chip-time": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled
    }
  });

interface DashboardTutorialsProps {
  /**
   * "grid" shows the full tutorial cards — the first-run dashboard, where
   * learning is the point. "compact" reduces them to a chip row, so a user
   * who already has workflows does not scroll past a wall of beginner art.
   */
  variant?: "grid" | "compact";
}

/** Dashboard section: the beginner tutorials, opening the Tutorials page. */
const DashboardTutorials: React.FC<DashboardTutorialsProps> = ({
  variant = "grid"
}) => {
  const theme = useTheme();
  const sectionWrap = useSectionWrap();
  const navigate = useNavigate();

  const open = useCallback(
    (id: string) => navigate(`/tutorials?id=${id}`),
    [navigate]
  );

  if (variant === "compact") {
    return (
      <section css={compactStyles(theme)}>
        <div css={sectionWrap}>
          <SectionHeader title="Learn" count={`${TUTORIALS.length} short walkthroughs`}>
            <SectionLink onClick={() => navigate("/tutorials")}>
              All tutorials
            </SectionLink>
          </SectionHeader>
          <div className="tut-row">
            {TUTORIALS.map((tutorial) => (
              <button
                key={tutorial.id}
                type="button"
                className="tut-chip"
                onClick={() => open(tutorial.id)}
              >
                {tutorial.title}
                <span className="tut-chip-time">{tutorial.durationLabel}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section css={gridStyles(theme)}>
      <div css={sectionWrap}>
        <SectionHeader title="Learn the basics" count="new to NodeTool? start here">
          <SectionLink onClick={() => navigate("/tutorials")}>
            All tutorials
          </SectionLink>
        </SectionHeader>
        <div className="tut-grid">
          {TUTORIALS.map((tutorial) => (
            <TutorialCard key={tutorial.id} tutorial={tutorial} onClick={open} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default memo(DashboardTutorials);
