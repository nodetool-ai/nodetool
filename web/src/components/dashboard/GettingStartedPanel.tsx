/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo } from "react";
import { Box } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { css, keyframes } from "@emotion/react";
import { useTheme, type Theme } from "@mui/material/styles";
import { useNavigate } from "react-router-dom";
import {
  ONBOARDING_STEP_ORDER,
  useOnboardingStore,
  type OnboardingStepId
} from "../../stores/OnboardingStore";
import { ONBOARDING_STEPS } from "../onboarding/steps";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { BORDER_RADIUS, EditorButton } from "../ui_primitives";

const EDITOR_ROUTE_PREFIX = "/editor/";

const fadeUp = keyframes`
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const styles = (theme: Theme) =>
  css({
    "&": {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: 32
    },

    /* ---- hero ---- */
    ".gs-hero": {
      display: "flex",
      flexDirection: "column",
      gap: 10,
      animation: `${fadeUp} 420ms ease-out both`
    },
    ".gs-eyebrow": {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.secondary,
      opacity: 0.7
    },
    ".gs-title": {
      margin: 0,
      fontSize: 36,
      lineHeight: 1.05,
      fontWeight: 700,
      letterSpacing: "-0.02em",
      backgroundImage:
        "linear-gradient(120deg, #ffffff 0%, #c8cad6 60%, #8b8fa3 100%)",
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent"
    },
    ".gs-subtitle": {
      fontSize: 14,
      lineHeight: 1.55,
      color: theme.vars.palette.text.secondary,
      maxWidth: 560
    },

    /* ---- progress strip ---- */
    ".gs-progress": {
      display: "flex",
      alignItems: "center",
      gap: 14,
      padding: "12px 14px",
      borderRadius: 14,
      border: `1px solid ${theme.vars.palette.divider}`,
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))"
    },
    ".gs-progress-meta": {
      display: "flex",
      flexDirection: "column",
      gap: 4,
      minWidth: 0,
      flex: "0 0 auto"
    },
    ".gs-progress-count": {
      fontSize: 13,
      fontWeight: 600,
      color: theme.vars.palette.text.primary,
      letterSpacing: "0.01em"
    },
    ".gs-progress-pct": {
      fontSize: 11,
      color: theme.vars.palette.text.secondary,
      letterSpacing: "0.04em"
    },
    ".gs-progress-track": {
      position: "relative",
      flex: 1,
      height: 4,
      borderRadius: BORDER_RADIUS.pill,
      backgroundColor: theme.vars.palette.grey[800],
      overflow: "hidden"
    },
    ".gs-progress-fill": {
      position: "absolute",
      inset: 0,
      borderRadius: BORDER_RADIUS.pill,
      background: `linear-gradient(90deg, ${theme.vars.palette.primary.light} 0%, ${theme.vars.palette.secondary.dark} 50%, ${theme.vars.palette.primary.main} 100%)`,
      transition: "transform 480ms cubic-bezier(0.22, 0.61, 0.36, 1)",
      transformOrigin: "left center"
    },

    /* ---- step list (timeline) ---- */
    ".gs-list": {
      position: "relative",
      display: "flex",
      flexDirection: "column",
      gap: 10
    },

    /* ---- card ---- */
    ".gs-card": {
      position: "relative",
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      columnGap: 18,
      alignItems: "flex-start",
      padding: "18px 20px",
      borderRadius: 16,
      border: `1px solid ${theme.vars.palette.divider}`,
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.005))",
      transition:
        "border-color 200ms ease, background 200ms ease, transform 200ms ease",
      animation: `${fadeUp} 480ms ease-out both`,
      "&::before": {
        content: '""',
        position: "absolute",
        inset: 0,
        borderRadius: "inherit",
        padding: 1,
        background:
          "linear-gradient(135deg, var(--gs-accent-from), var(--gs-accent-to))",
        WebkitMask:
          "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
        opacity: 0,
        transition: "opacity 200ms ease",
        pointerEvents: "none"
      },
      "&:hover": {
        borderColor: "transparent",
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))",
        transform: "translateY(-1px)"
      },
      "&:hover::before": {
        opacity: 1
      }
    },
    ".gs-card.completed": {
      opacity: 0.55,
      "&:hover": {
        opacity: 0.75,
        transform: "none"
      },
      "&:hover::before": {
        opacity: 0.3
      }
    },

    /* ---- icon column ---- */
    ".gs-icon-stack": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      paddingTop: 2
    },
    ".gs-icon-tile": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 44,
      height: 44,
      borderRadius: 12,
      color: "#fff",
      background:
        "linear-gradient(135deg, var(--gs-accent-from), var(--gs-accent-to))",
      boxShadow:
        "0 6px 18px -8px var(--gs-accent-from), inset 0 1px 0 rgba(255,255,255,0.18)",
      "& svg": {
        fontSize: 22,
        filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))"
      }
    },
    ".gs-card.completed .gs-icon-tile": {
      filter: "saturate(0.4)"
    },

    /* ---- content column ---- */
    ".gs-content": {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      minWidth: 0
    },
    ".gs-step-badge": {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: "transparent",
      backgroundImage:
        "linear-gradient(120deg, var(--gs-accent-from), var(--gs-accent-to))",
      WebkitBackgroundClip: "text",
      backgroundClip: "text"
    },
    ".gs-step-title": {
      margin: 0,
      fontSize: 17,
      fontWeight: 600,
      lineHeight: 1.3,
      color: theme.vars.palette.text.primary,
      letterSpacing: "-0.005em"
    },
    ".gs-card.completed .gs-step-title": {
      color: theme.vars.palette.text.secondary
    },
    ".gs-step-desc": {
      margin: 0,
      fontSize: 13,
      lineHeight: 1.55,
      color: theme.vars.palette.text.secondary
    },
    ".gs-cta-row": {
      marginTop: 8
    },
    ".gs-cta": {
      textTransform: "none",
      fontSize: 12.5,
      fontWeight: 600,
      letterSpacing: "0.01em",
      borderRadius: 10,
      padding: "5px 12px",
      color: theme.vars.palette.text.primary,
      borderColor: "transparent",
      backgroundColor: "rgba(255,255,255,0.04)",
      transition: "all 180ms ease",
      "& .MuiButton-endIcon": {
        marginLeft: 4,
        transition: "transform 180ms ease"
      },
      "&:hover": {
        backgroundImage:
          "linear-gradient(120deg, var(--gs-accent-from), var(--gs-accent-to))",
        color: "#fff",
        borderColor: "transparent",
        boxShadow: "0 8px 22px -10px var(--gs-accent-from)"
      },
      "&:hover .MuiButton-endIcon": {
        transform: "translateX(2px)"
      }
    },

    /* ---- status indicator ---- */
    ".gs-status": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: 26,
      height: 26,
      borderRadius: "50%",
      flexShrink: 0,
      marginTop: 9
    },
    ".gs-status.pending": {
      border: `1.5px dashed ${theme.vars.palette.grey[700]}`,
      color: "transparent"
    },
    ".gs-status.done": {
      background:
        "linear-gradient(135deg, var(--gs-accent-from), var(--gs-accent-to))",
      color: "#fff",
      boxShadow: "0 4px 14px -6px var(--gs-accent-from)",
      "& svg": { fontSize: 16 }
    }
  });

const GettingStartedPanel: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  const completed = useOnboardingStore((s) => s.completed);
  const createNewWorkflow = useWorkflowManager((s) => s.createNew);

  const navigateToStep = useCallback(
    async (id: OnboardingStepId) => {
      const step = ONBOARDING_STEPS[id];
      if (step.settingsTab !== undefined) {
        navigate(`/settings?tab=${step.settingsTab}`);
        return;
      }
      const route = step.route;
      if (!route) return;

      if (route === "/editor") {
        const stored = localStorage.getItem("currentWorkflowId");
        if (stored) {
          navigate(`${EDITOR_ROUTE_PREFIX}${stored}`);
          return;
        }
        try {
          const open = JSON.parse(
            localStorage.getItem("openWorkflows") ?? "[]"
          ) as string[];
          if (open.length > 0) {
            navigate(`${EDITOR_ROUTE_PREFIX}${open[0]}`);
            return;
          }
        } catch {
          // fall through and create a new workflow
        }
        try {
          const wf = await createNewWorkflow();
          navigate(`${EDITOR_ROUTE_PREFIX}${wf.id}`);
        } catch (err) {
          console.error("Failed to create workflow:", err);
        }
        return;
      }

      navigate(route);
    },
    [navigate, createNewWorkflow]
  );

  const completedCount = useMemo(
    () => ONBOARDING_STEP_ORDER.filter((id) => completed[id]).length,
    [completed]
  );
  const totalSteps = ONBOARDING_STEP_ORDER.length;
  const progressPercentage = (completedCount / totalSteps) * 100;
  const allDone = completedCount === totalSteps;

  return (
    <Box css={styles(theme)} className="getting-started-panel">
      <header className="gs-hero">
        <span className="gs-eyebrow">Welcome to NodeTool</span>
        <h1 className="gs-title">
          {allDone ? "You're all set." : "Let's get you running."}
        </h1>
        <p className="gs-subtitle">
          {allDone
            ? "Every step is checked off. Pick up where you left off, or open a new workflow."
            : "Six small moves and you'll know the whole tool. Hints float next to the right UI as you work — finish each step to clear them."}
        </p>
      </header>

      <div className="gs-progress" role="group" aria-label="Onboarding progress">
        <div className="gs-progress-meta">
          <span className="gs-progress-count">
            {completedCount}<span style={{ opacity: 0.5 }}> / {totalSteps}</span>
          </span>
          <span className="gs-progress-pct">{Math.round(progressPercentage)}% complete</span>
        </div>
        <div className="gs-progress-track" aria-hidden>
          <div
            className="gs-progress-fill"
            style={{ transform: `scaleX(${progressPercentage / 100})` }}
          />
        </div>
      </div>

      <ol className="gs-list" aria-label="Getting started steps">
        {ONBOARDING_STEP_ORDER.map((id, index) => {
          const step = ONBOARDING_STEPS[id];
          const isCompleted = completed[id];
          const accentVars = {
            ["--gs-accent-from" as string]: step.accent.from,
            ["--gs-accent-to" as string]: step.accent.to
          } as React.CSSProperties;

          return (
            <li
              key={id}
              className={`gs-card ${isCompleted ? "completed" : ""}`}
              style={{
                ...accentVars,
                animationDelay: `${index * 60}ms`
              }}
            >
              <div className="gs-icon-stack">
                <div className="gs-icon-tile" aria-hidden>
                  {React.cloneElement(
                    step.illustration as React.ReactElement<{
                      sx?: { fontSize?: number | string };
                    }>,
                    { sx: { fontSize: 22 } }
                  )}
                </div>
              </div>

              <div className="gs-content">
                <span className="gs-step-badge">
                  Step {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="gs-step-title">{step.title}</h3>
                <p className="gs-step-desc">{step.description}</p>
                <div className="gs-cta-row">
                  <EditorButton
                    size="small"
                    className="gs-cta"
                    onClick={() => navigateToStep(id)}
                    endIcon={<ArrowForwardRoundedIcon />}
                    disableElevation
                  >
                    {isCompleted
                      ? "Revisit"
                      : (step.ctaLabel ?? "Show me")}
                  </EditorButton>
                </div>
              </div>

              <div
                className={`gs-status ${isCompleted ? "done" : "pending"}`}
                aria-label={isCompleted ? "Completed" : "Not completed"}
              >
                {isCompleted && <CheckRoundedIcon />}
              </div>
            </li>
          );
        })}
      </ol>
    </Box>
  );
};

export default React.memo(GettingStartedPanel);
