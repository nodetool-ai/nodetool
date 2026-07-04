/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { TutorialCard } from "../tutorials/TutorialCard";
import { TUTORIALS } from "../tutorials/tutorialsData";
import { wrapStyles, SectionHeader, SectionLink } from "./dashboardChrome";

const gridStyles = (theme: Theme) =>
  css({
    paddingTop: 8,
    ".tut-grid": {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 8,
      [theme.breakpoints.down("md")]: {
        gridTemplateColumns: "repeat(2, 1fr)"
      },
      [theme.breakpoints.down("sm")]: {
        gridTemplateColumns: "1fr"
      }
    }
  });

/** Dashboard section: the beginner tutorials, opening the Tutorials page. */
const DashboardTutorials: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  const open = useCallback(
    (id: string) => navigate(`/tutorials?id=${id}`),
    [navigate]
  );

  return (
    <section css={gridStyles(theme)}>
      <div css={wrapStyles(theme)}>
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
