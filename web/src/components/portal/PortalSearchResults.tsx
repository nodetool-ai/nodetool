// web/src/components/portal/PortalSearchResults.tsx
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useMemo } from "react";
import { Workflow } from "../../stores/ApiTypes";

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    background: theme.vars.palette.background.paper,
    backdropFilter: "blur(8px)",
    border: `1px solid ${theme.vars.palette.action.focus}`,
    borderRadius: 10,
    overflow: "hidden",
    zIndex: 100,
    boxShadow: theme.vars.shadows?.[8] ?? "0 8px 24px var(--palette-glass-backgroundDialog)",
    animation: "portalSearchSlideDown 200ms ease-out",
    "@keyframes portalSearchSlideDown": {
      from: { opacity: 0, transform: "translateY(-4px)" },
      to: { opacity: 1, transform: "translateY(0)" },
    },
    ".portal-search-item": {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "10px 14px",
      cursor: "pointer",
      transition: "background 0.1s",
      "&:hover": {
        background: theme.vars.palette.c_gray2,
      },
    },
    ".portal-search-icon": {
      fontSize: 12,
      color: theme.vars.palette.c_gray4,
    },
    ".portal-search-title": {
      fontSize: 13,
      color: theme.vars.palette.c_white,
    },
    ".portal-search-type": {
      fontSize: 10,
      color: theme.vars.palette.c_gray5,
      marginLeft: "auto",
    },
  });

type PortalSearchResultsProps = {
  query: string;
  workflows: Workflow[];
  templates: Workflow[];
  onSelectWorkflow: (workflowId: string) => void;
  onSelectTemplate: (templateId: string) => void;
};

type SearchResult = {
  id: string;
  title: string;
  type: "workflow" | "template";
};

const PortalSearchResults: React.FC<PortalSearchResultsProps> = ({
  query,
  workflows,
  templates,
  onSelectWorkflow,
  onSelectTemplate,
}) => {
  const theme = useTheme();

  const results = useMemo(() => {
    if (!query || query.length < 2) {return [];}

    const q = query.toLowerCase();
    const matches: SearchResult[] = [];

    workflows.forEach((w) => {
      if ((w.name || "").toLowerCase().includes(q)) {
        matches.push({ id: w.id, title: w.name || "Untitled", type: "workflow" });
      }
    });

    templates.forEach((t) => {
      if ((t.name || "").toLowerCase().includes(q)) {
        matches.push({ id: t.id, title: t.name || "Untitled", type: "template" });
      }
    });

    return matches.slice(0, 5);
  }, [query, workflows, templates]);

  if (results.length === 0) {return null;}

  return (
    <div css={styles(theme)}>
      {results.map((r) => (
        <div
          key={`${r.type}-${r.id}`}
          className="portal-search-item"
          onClick={() =>
            r.type === "workflow"
              ? onSelectWorkflow(r.id)
              : onSelectTemplate(r.id)
          }
        >
          <span className="portal-search-icon">
            {r.type === "workflow" ? "\u26A1" : "\uD83D\uDCCB"}
          </span>
          <span className="portal-search-title">{r.title}</span>
          <span className="portal-search-type">{r.type}</span>
        </div>
      ))}
    </div>
  );
};

export default memo(PortalSearchResults);
