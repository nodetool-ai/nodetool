/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Thread } from "../../stores/ApiTypes";
import { trpcClient } from "../../trpc/client";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import {
  EmptyState,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useSectionWrap, SectionHeader, SectionLink } from "./dashboardChrome";
import { shortAgo } from "./runStatus";

const MAX_SESSIONS = 8;

const styles = (theme: Theme) =>
  css({
    paddingTop: getSpacingPx(SPACING.md),
    ".sess-list": {
      border: `1px solid ${theme.vars.palette.divider}`,
      borderRadius: BORDER_RADIUS.lg,
      background: theme.vars.palette.c_node_bg,
      padding: getSpacingPx(SPACING.sm),
      display: "flex",
      flexDirection: "column",
      gap: getSpacingPx(SPACING.micro)
    },
    ".sess-row": {
      display: "flex",
      alignItems: "center",
      gap: getSpacingPx(SPACING.md),
      width: "100%",
      textAlign: "left",
      padding: `${getSpacingPx(SPACING.sm)} ${getSpacingPx(SPACING.md)}`,
      background: "transparent",
      border: "none",
      borderRadius: BORDER_RADIUS.sm,
      cursor: "pointer",
      transition: `background ${MOTION.fast}`,
      "&:hover": { background: theme.vars.palette.action.hover }
    },
    ".sess-icon": {
      flexShrink: 0,
      display: "grid",
      placeItems: "center",
      width: 24,
      height: 24,
      borderRadius: BORDER_RADIUS.sm,
      background: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
      color: theme.vars.palette.primary.main
    },
    ".sess-title": {
      flex: 1,
      minWidth: 0,
      fontSize: "var(--fontSizeSmall)",
      color: theme.vars.palette.text.primary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".sess-when": {
      flexShrink: 0,
      fontFamily: theme.fontFamily2,
      fontSize: "var(--fontSizeSmaller)",
      color: theme.vars.palette.text.disabled
    }
  });

interface DashboardAgentSessionsProps {
  /** Open a fresh agent chat, the same way the hero's agent track does. */
  onNewSession: () => void;
}

/**
 * The user's agent conversations, first in the dashboard's main column: an
 * agent-centric dashboard resumes the work the agent was doing before it
 * shows anything else.
 */
const DashboardAgentSessions: React.FC<DashboardAgentSessionsProps> = ({
  onNewSession
}) => {
  const theme = useTheme();
  const sectionWrap = useSectionWrap();
  const navigate = useNavigate();
  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "threads"],
    queryFn: () => trpcClient.threads.list.query({ limit: 50 }),
    staleTime: 30_000
  });

  const sessions = useMemo(() => {
    const all: Thread[] = data?.threads ?? [];
    return [...all]
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
      .slice(0, MAX_SESSIONS);
  }, [data]);

  const openSession = useCallback(
    (thread: Thread) => {
      openTab({
        type: "chat",
        ref: thread.id,
        mode: "view",
        title: thread.title || "Untitled chat"
      });
      navigate("/workspace");
    },
    [openTab, navigate]
  );

  // While loading there is nothing useful to say; the section appears when
  // the threads do, and the empty state only once we know there are none.
  if (isLoading) {
    return null;
  }

  return (
    <section css={styles(theme)} aria-label="Agent sessions">
      <div css={sectionWrap}>
        <SectionHeader
          title="Agent sessions"
          count={sessions.length > 0 ? `${sessions.length}` : undefined}
        >
          <SectionLink onClick={onNewSession}>New session</SectionLink>
        </SectionHeader>

        {sessions.length === 0 ? (
          <EmptyState
            size="small"
            title="No agent sessions yet"
            description="Describe a task above, or start a session — the agent plans it, runs it, and the conversation lands here."
            actionText="Start a session"
            onAction={onNewSession}
          />
        ) : (
          <div className="sess-list">
            {sessions.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className="sess-row"
                onClick={() => openSession(thread)}
              >
                <span className="sess-icon" aria-hidden>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M3 3h10v7H8l-3 3v-3H3z" />
                  </svg>
                </span>
                <span className="sess-title">
                  {thread.title || "Untitled chat"}
                </span>
                <span className="sess-when">{shortAgo(thread.updated_at)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default memo(DashboardAgentSessions);
