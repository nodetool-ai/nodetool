// web/src/components/portal/PortalRecents.tsx
/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useMemo } from "react";
import { Thread, Workflow } from "../../stores/ApiTypes";

const styles = (theme: Theme) =>
  css({
    width: "100%",
    maxWidth: 440,
    margin: "0 auto",
    paddingTop: 16,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    ".portal-recent-item": {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 0",
      cursor: "pointer",
      borderRadius: 6,
      transition: "opacity 0.15s ease",
      "&:hover": {
        opacity: 0.8,
      },
    },
    ".portal-recent-icon": {
      fontSize: 11,
      color: theme.vars.palette.c_gray4,
      width: 16,
      textAlign: "center" as const,
    },
    ".portal-recent-title": {
      fontSize: 12,
      color: theme.vars.palette.c_gray4,
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap" as const,
    },
    ".portal-recent-time": {
      fontSize: 10,
      color: theme.vars.palette.c_gray5,
    },
  });

type RecentItem = {
  id: string;
  title: string;
  updatedAt: string;
  type: "workflow" | "chat";
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  const diffWeek = Math.floor(diffDay / 7);
  return `${diffWeek}w`;
}

type PortalRecentsProps = {
  workflows: Workflow[];
  threads: Record<string, Thread>;
  onWorkflowClick: (workflowId: string) => void;
  onThreadClick: (threadId: string) => void;
};

const PortalRecents: React.FC<PortalRecentsProps> = ({
  workflows,
  threads,
  onWorkflowClick,
  onThreadClick,
}) => {
  const theme = useTheme();

  const recentItems = useMemo(() => {
    const items: RecentItem[] = [];

    workflows.forEach((w) => {
      items.push({
        id: w.id,
        title: w.name || "Untitled Workflow",
        updatedAt: w.updated_at || w.created_at || "",
        type: "workflow",
      });
    });

    Object.values(threads).forEach((t) => {
      items.push({
        id: t.id,
        title: t.title || "Untitled Chat",
        updatedAt: t.updated_at || t.created_at || "",
        type: "chat",
      });
    });

    items.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return items.slice(0, 5);
  }, [workflows, threads]);

  if (recentItems.length === 0) return null;

  return (
    <div css={styles(theme)}>
      {recentItems.map((item) => (
        <div
          key={`${item.type}-${item.id}`}
          className="portal-recent-item"
          onClick={() =>
            item.type === "workflow"
              ? onWorkflowClick(item.id)
              : onThreadClick(item.id)
          }
        >
          <span className="portal-recent-icon">
            {item.type === "chat" ? "\uD83D\uDCAC" : "\u26A1"}
          </span>
          <span className="portal-recent-title">{item.title}</span>
          <span className="portal-recent-time">
            {formatRelativeTime(item.updatedAt)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default memo(PortalRecents);
