/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type React from "react";
import { memo } from "react";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import DataObjectIcon from "@mui/icons-material/DataObject";
import NotesIcon from "@mui/icons-material/Notes";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

interface QuickStart {
  icon: React.ReactNode;
  label: string;
  prompt: string;
}

interface AssistantQuickStartsProps {
  propertyName: string;
  onQuickStart: (prompt: string) => void;
}

const buildQuickStarts = (propertyName: string): QuickStart[] => {
  const target = `the "${propertyName}" value`;
  return [
    {
      icon: <AutoFixHighIcon />,
      label: "Draft a prompt from scratch",
      prompt: `Draft ${target} from scratch. Ask me about the goal and audience if you need to, then write a clear, well-structured prompt.`
    },
    {
      icon: <DataObjectIcon />,
      label: "Add input variables",
      prompt: `Rewrite ${target} to use {{ variable }} placeholders for the key inputs so it works as a reusable template.`
    },
    {
      icon: <NotesIcon />,
      label: "Make it more concise",
      prompt: `Make ${target} more concise without losing any important instructions or constraints.`
    },
    {
      icon: <ArticleOutlinedIcon />,
      label: "Add a system role & sections",
      prompt: `Restructure ${target} with a clear system role and labeled sections (context, task, constraints, output format).`
    }
  ];
};

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    gap: "1.1em",
    padding: "1.5em 1em 0.5em",
    ".hero": {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      gap: "0.5em"
    },
    ".hero-badge": {
      width: "3em",
      height: "3em",
      borderRadius: "var(--rounded-lg)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: theme.vars.palette.primary.main,
      background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
      border: `1px solid rgba(${theme.vars.palette.primary.mainChannel} / 0.25)`,
      marginBottom: "0.25em",
      svg: { fontSize: "1.6em" }
    },
    ".hero-title": {
      margin: 0,
      fontSize: "var(--fontSizeBig)",
      fontWeight: 600,
      color: theme.vars.palette.text.primary
    },
    ".hero-text": {
      margin: 0,
      maxWidth: "22em",
      fontSize: "var(--fontSizeSmall)",
      lineHeight: 1.5,
      color: theme.vars.palette.text.secondary
    },
    ".quick-label": {
      fontSize: "var(--fontSizeTiny)",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: theme.vars.palette.text.disabled,
      paddingLeft: "0.2em"
    },
    ".quick-list": {
      display: "flex",
      flexDirection: "column",
      gap: "0.5em"
    },
    ".quick-item": {
      display: "flex",
      alignItems: "center",
      gap: "0.75em",
      width: "100%",
      padding: "0.7em 0.85em",
      borderRadius: "var(--rounded-lg)",
      cursor: "pointer",
      textAlign: "left",
      color: theme.vars.palette.text.primary,
      backgroundColor: `rgba(${theme.vars.palette.background.paperChannel} / 0.5)`,
      border: `1px solid rgba(${theme.vars.palette.common.whiteChannel} / 0.06)`,
      transition: "all 0.15s ease",
      "&:hover": {
        borderColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.5)`,
        backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.08)`,
        transform: "translateX(2px)"
      },
      ".quick-icon": {
        display: "flex",
        color: theme.vars.palette.primary.light,
        svg: { fontSize: "var(--fontSizeBig)" }
      },
      ".quick-text": {
        flex: 1,
        fontSize: "var(--fontSizeSmall)",
        fontWeight: 500
      },
      ".quick-arrow": {
        display: "flex",
        color: theme.vars.palette.text.disabled,
        svg: { fontSize: "var(--fontSizeNormal)" }
      }
    }
  });

const AssistantQuickStarts = ({
  propertyName,
  onQuickStart
}: AssistantQuickStartsProps) => {
  const theme = useTheme();
  const quickStarts = buildQuickStarts(propertyName);

  return (
    <div className="assistant-quick-starts" css={styles(theme)}>
      <div className="hero">
        <div className="hero-badge">
          <AutoAwesomeIcon />
        </div>
        <h3 className="hero-title">Write this prompt with AI</h3>
        <p className="hero-text">
          Describe what you want, or start from one of these. Drafts drop
          straight into the editor.
        </p>
      </div>
      <span className="quick-label">Quick starts</span>
      <div className="quick-list">
        {quickStarts.map((item) => (
          <button
            key={item.label}
            type="button"
            className="quick-item"
            onClick={() => onQuickStart(item.prompt)}
          >
            <span className="quick-icon">{item.icon}</span>
            <span className="quick-text">{item.label}</span>
            <span className="quick-arrow">
              <ChevronRightIcon />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default memo(AssistantQuickStarts);
