/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import Logo from "../Logo";
import {
  VideoPlayer,
  EditorButton,
  MOTION,
  BORDER_RADIUS,
  getSpacingPx
} from "../ui_primitives";
import { TutorialCard } from "./TutorialCard";
import { TUTORIALS, getTutorial } from "./tutorialsData";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    background: theme.vars.palette.background.paper,
    color: theme.vars.palette.text.primary,
    overflow: "hidden",

    ".tut-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5),
      padding: `${getSpacingPx(4)} ${getSpacingPx(6)}`,
      borderBottom: `1px solid ${theme.vars.palette.divider}`,
      flexShrink: 0
    },
    ".tut-header .titles": { display: "flex", flexDirection: "column", gap: 2 },
    ".tut-header h1": {
      margin: 0,
      fontSize: "var(--fontSizeBig)",
      fontWeight: 600,
      letterSpacing: "-0.012em"
    },
    ".tut-header .sub": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary
    },
    ".tut-header .spacer": { flex: 1 },
    ".back": {
      display: "inline-flex",
      alignItems: "center",
      gap: theme.spacing(0.5),
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary,
      background: "none",
      border: "none",
      cursor: "pointer",
      transition: `color ${MOTION.fast}`,
      "&:hover": { color: theme.vars.palette.text.primary },
      "& svg": { fontSize: 18 }
    },

    ".tut-body": {
      flex: 1,
      minHeight: 0,
      display: "grid",
      gridTemplateColumns: "320px 1fr",
      [theme.breakpoints.down("md")]: { gridTemplateColumns: "1fr" }
    },

    ".tut-sidebar": {
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      overflowY: "auto",
      padding: getSpacingPx(4),
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(3),
      [theme.breakpoints.down("md")]: {
        borderRight: "none",
        borderBottom: `1px solid ${theme.vars.palette.divider}`
      }
    },
    ".tut-sidebar .sidebar-label": {
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.disabled
    },

    ".tut-main": { overflowY: "auto", padding: getSpacingPx(8) },
    ".tut-main .stage": { maxWidth: 920, margin: "0 auto" },
    ".tut-player": {
      width: "100%",
      aspectRatio: "16 / 9",
      borderRadius: BORDER_RADIUS.lg,
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.divider}`,
      background: theme.vars.palette.common.black,
      boxShadow: "0 20px 50px rgba(0,0,0,0.4)"
    },
    ".tut-meta": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.25),
      marginTop: getSpacingPx(5)
    },
    ".tut-meta .pill": {
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      padding: `${getSpacingPx(0.5)} ${getSpacingPx(2)}`,
      borderRadius: BORDER_RADIUS.pill,
      color: theme.vars.palette.common.white
    },
    ".tut-meta .dur": {
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary
    },
    ".tut-title": {
      margin: `${getSpacingPx(2)} 0 0`,
      fontSize: "var(--fontSizeBig)",
      fontWeight: 600,
      letterSpacing: "-0.012em"
    },
    ".tut-desc": {
      margin: `${getSpacingPx(2)} 0 0`,
      fontSize: "var(--fontSizeNormal)",
      lineHeight: 1.6,
      color: theme.vars.palette.text.secondary,
      maxWidth: 680
    },

    ".tut-learn": {
      marginTop: getSpacingPx(6),
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(2)
    },
    ".tut-learn h2": {
      margin: 0,
      fontSize: "var(--fontSizeNormal)",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    ".tut-learn ul": { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: getSpacingPx(1.5) },
    ".tut-learn li": {
      display: "flex",
      alignItems: "flex-start",
      gap: theme.spacing(1),
      fontSize: "var(--fontSizeNormal)",
      color: theme.vars.palette.text.secondary
    },
    ".tut-learn li svg": {
      fontSize: 18,
      marginTop: 2,
      flexShrink: 0,
      color: theme.vars.palette.success.main
    },

    ".tut-cta": {
      display: "flex",
      gap: theme.spacing(1.5),
      marginTop: getSpacingPx(8),
      flexWrap: "wrap"
    }
  });

const TutorialsPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const active = getTutorial(params.get("id"));

  const select = useCallback(
    (id: string) => {
      setParams({ id }, { replace: true });
    },
    [setParams]
  );

  return (
    <div className="page-enter" css={styles(theme)}>
      <header className="tut-header">
        <Logo small width="26px" height="26px" fontSize="1em" borderRadius={BORDER_RADIUS.sm} />
        <div className="titles">
          <h1>Tutorials</h1>
          <span className="sub">Short, beginner-friendly walkthroughs of NodeTool</span>
        </div>
        <span className="spacer" />
        <button type="button" className="back" onClick={() => navigate("/dashboard")}>
          <ArrowBackRoundedIcon />
          Dashboard
        </button>
      </header>

      <div className="tut-body">
        <aside className="tut-sidebar">
          <span className="sidebar-label">{TUTORIALS.length} tutorials</span>
          {TUTORIALS.map((tutorial) => (
            <TutorialCard
              key={tutorial.id}
              tutorial={tutorial}
              active={tutorial.id === active.id}
              onClick={select}
            />
          ))}
        </aside>

        <main className="tut-main">
          <div className="stage">
            <div className="tut-player">
              <VideoPlayer
                key={active.id}
                src={active.video}
                poster={active.poster}
                autoplay
                muted
              />
            </div>

            <div className="tut-meta">
              <span className="pill" style={{ background: active.accent }}>
                {active.level}
              </span>
              <span className="dur">{active.durationLabel}</span>
            </div>

            <h2 className="tut-title">{active.title}</h2>
            <p className="tut-desc">{active.description}</p>

            <section className="tut-learn">
              <h2>What you'll learn</h2>
              <ul>
                {active.learn.map((point) => (
                  <li key={point}>
                    <CheckRoundedIcon />
                    {point}
                  </li>
                ))}
              </ul>
            </section>

            <div className="tut-cta">
              <EditorButton variant="contained" onClick={() => navigate("/dashboard")}>
                Start building
              </EditorButton>
              <EditorButton variant="outlined" onClick={() => navigate("/examples")}>
                Browse examples
              </EditorButton>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default memo(TutorialsPage);
