/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { memo, useCallback, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import Logo from "../Logo";
import {
  BORDER_RADIUS,
  EditorButton,
  getSpacingPx,
  MOTION,
  SPACING,
  VideoPlayer
} from "../ui_primitives";
import { TutorialCard } from "./TutorialCard";
import { TUTORIALS, getTutorial } from "./tutorialsData";
import { resolveStaticMediaUri } from "../../utils/resolveMediaUri";

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
      flexShrink: 0,
      [theme.breakpoints.down("md")]: {
        padding: `${getSpacingPx(SPACING.lg)} ${getSpacingPx(SPACING.lg)}`
      }
    },
    ".tut-header .titles": {
      display: "flex",
      flexDirection: "column",
      gap: 2,
      minWidth: 0
    },
    ".tut-header h1": {
      margin: 0,
      fontSize: "var(--fontSizeBig)",
      fontWeight: 600,
      letterSpacing: "-0.012em"
    },
    ".tut-header .sub": {
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.secondary,
      [theme.breakpoints.down("md")]: { display: "none" }
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
      "& svg": { fontSize: 18 },
      "@media (pointer: coarse)": { minHeight: 44, paddingLeft: 0 }
    },

    ".tut-body": {
      flex: 1,
      minHeight: 0,
      display: "grid",
      gridTemplateColumns: "320px 1fr",
      // Stacked: one scroll container for the whole page instead of two
      // competing ones squeezed into a viewport-height grid.
      [theme.breakpoints.down("md")]: {
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch"
      }
    },

    ".tut-sidebar": {
      borderRight: `1px solid ${theme.vars.palette.divider}`,
      overflowY: "auto",
      padding: getSpacingPx(4),
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(3),
      [theme.breakpoints.down("md")]: {
        // The player leads; the list follows it, one column per phone-width
        // track so a tablet gets two abreast.
        order: 2,
        borderRight: "none",
        borderTop: `1px solid ${theme.vars.palette.divider}`,
        overflow: "visible",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        alignItems: "start",
        padding: getSpacingPx(SPACING.lg),
        gap: getSpacingPx(SPACING.md)
      }
    },
    // Cards keep their natural height; the sidebar scrolls instead of
    // squeezing them until the titles disappear.
    ".tut-sidebar > *": { flexShrink: 0 },
    ".tut-sidebar .sidebar-label": {
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.disabled,
      [theme.breakpoints.down("md")]: { gridColumn: "1 / -1" }
    },

    ".tut-main": {
      overflowY: "auto",
      padding: getSpacingPx(8),
      [theme.breakpoints.down("md")]: {
        order: 1,
        overflow: "visible",
        padding: getSpacingPx(SPACING.lg)
      }
    },
    ".tut-main .stage": { maxWidth: 920, margin: "0 auto" },
    ".tut-player": {
      position: "relative",
      width: "100%",
      aspectRatio: "16 / 9",
      borderRadius: BORDER_RADIUS.lg,
      overflow: "hidden",
      border: `1px solid ${theme.vars.palette.divider}`,
      background: theme.vars.palette.common.black,
      boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
      [theme.breakpoints.down("md")]: { boxShadow: "none" }
    },
    ".tut-play": {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "none",
      background: "transparent",
      color: theme.vars.palette.common.white,
      cursor: "pointer",
      transition: MOTION.background,
      "&:hover": {
        background: "rgba(var(--palette-common-black-channel) / 0.25)"
      },
      svg: {
        width: getSpacingPx(16),
        height: getSpacingPx(16),
        borderRadius: BORDER_RADIUS.circle,
        background: "rgba(var(--palette-common-black-channel) / 0.55)",
        padding: getSpacingPx(2)
      }
    },
    ".tut-meta": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(SPACING.sm),
      marginTop: getSpacingPx(5),
      [theme.breakpoints.down("md")]: { marginTop: getSpacingPx(SPACING.lg) }
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
      [theme.breakpoints.down("md")]: { marginTop: getSpacingPx(SPACING.xl) },
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
      flexWrap: "wrap",
      [theme.breakpoints.down("md")]: {
        marginTop: getSpacingPx(SPACING.xl),
        "& > button": { flex: 1, minHeight: 44 }
      }
    }
  });

const TutorialsPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const stacked = useMediaQuery(theme.breakpoints.down("md"));
  const bodyRef = useRef<HTMLDivElement>(null);

  const active = getTutorial(params.get("id"));

  // The videos stream from the docs site, so none is requested until someone
  // asks for one — the poster ships with the app and carries the stage. Keyed
  // by id so switching tutorials returns to the poster.
  const [startedId, setStartedId] = useState<string | null>(null);
  const started = startedId === active.id;
  const start = useCallback(() => setStartedId(active.id), [active.id]);

  const select = useCallback(
    (id: string) => {
      setParams({ id }, { replace: true });
      // Stacked, the list sits below the player — bring the player back up.
      if (stacked) {
        bodyRef.current?.scrollTo?.({ top: 0, behavior: "smooth" });
      }
    },
    [setParams, stacked]
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
        <button type="button" className="back" onClick={() => navigate("/workspace")}>
          <ArrowBackRoundedIcon />
          Workspace
        </button>
      </header>

      <div className="tut-body" ref={bodyRef}>
        <aside className="tut-sidebar">
          <span className="sidebar-label">{TUTORIALS.length} tutorials</span>
          {TUTORIALS.map((tutorial) => (
            <TutorialCard
              key={tutorial.id}
              tutorial={tutorial}
              active={tutorial.id === active.id}
              compact={stacked}
              onClick={select}
            />
          ))}
        </aside>

        <main className="tut-main">
          <div className="stage">
            <div className="tut-player">
              <VideoPlayer
                key={active.id}
                src={
                  started
                    ? resolveStaticMediaUri(active.video) ?? undefined
                    : undefined
                }
                poster={resolveStaticMediaUri(active.poster) ?? undefined}
                autoplay={started}
                muted
              />
              {!started && (
                <button
                  type="button"
                  className="tut-play"
                  onClick={start}
                  aria-label={`Play video: ${active.title}`}
                >
                  <PlayArrowRoundedIcon />
                </button>
              )}
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
              <EditorButton variant="contained" onClick={() => navigate("/workspace")}>
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
